import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { parseVoiceCommand, dateFromRelative } from '../../../lib/voiceIntent';
import { RATES, WASTE_TYPES } from '../../../lib/rates';
import { AI_LANGUAGE_INSTRUCTION, type Language } from '../../../lib/i18n';
import {
  collectorMonthlyStats,
  findActiveRequestForUser,
  findUserById,
  updateRequest,
} from '../../../lib/localdb';

export const runtime = 'nodejs';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const MODEL = process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini';

const openai = OPENROUTER_API_KEY
  ? new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://kabad-saathi.example.com', // Optional
        'X-Title': 'Kabad Saathi', // Optional
      },
    })
  : null;

const SYSTEM_PROMPT = `You are "AI Saathi", the in-app assistant for Kabad Saathi — an app that connects households (customers) with informal waste collectors (kabadiwalas) for doorstep scrap pickup, and helps collectors sell sorted scrap on to formal recyclers.

Waste categories and current rates (₹/kg): ${Object.entries(RATES)
  .map(([k, v]) => `${k}=₹${v}`)
  .join(', ')}.

Be warm, concise (2-4 sentences unless the user asks for detail), and practical. Use tools whenever the user is asking about THEIR OWN account/data (status, earnings, price, cancelling) instead of guessing. If a tool needs a signed-in user and none is available, say so plainly. For general questions about how the app works, safety, payments, or recycling, answer directly from what you know about this app — don't invent features that don't exist.`;

const TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'get_scrap_price',
      description: 'Look up the current ₹/kg rate for one or more scrap categories.',
      parameters: {
        type: 'object',
        properties: {
          types: {
            type: 'array',
            items: { type: 'string', enum: WASTE_TYPES },
            description: 'Scrap categories to look up. Leave empty to get the full rate card.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_pickup_status',
      description: "Check the signed-in user's currently active (pending/accepted/on the way) pickup request.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_pickup',
      description: "Cancel the signed-in customer's pending pickup request, if one exists.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_earnings',
      description: "Get the signed-in collector's earnings/pickups/rating stats for this month.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_booking_draft',
      description:
        'Pre-fill (but do NOT submit) a new pickup booking form for the signed-in customer with scrap types/date/time parsed from their message.',
      parameters: {
        type: 'object',
        properties: {
          types: { type: 'array', items: { type: 'string', enum: WASTE_TYPES } },
          date: { type: 'string', enum: ['today', 'tomorrow', 'day_after'] },
          time: { type: 'string', enum: ['Morning', 'Afternoon', 'Evening', 'Night'] },
        },
      },
    },
  },
];

function runTool(
  name: string,
  input: any,
  ctx: { userId?: string; role?: 'customer' | 'collector' },
): { result: string; bookingDraft?: any } {
  const user = ctx.userId ? findUserById(ctx.userId) : undefined;

  switch (name) {
    case 'get_scrap_price': {
      const types: string[] = Array.isArray(input?.types) && input.types.length ? input.types : WASTE_TYPES;
      const lines = types.filter((t) => RATES[t] != null).map((t) => `${t}: ₹${RATES[t]}/kg`);
      return { result: lines.join(', ') || 'No matching scrap category found.' };
    }
    case 'check_pickup_status': {
      if (!user) return { result: 'No signed-in user.' };
      const active = findActiveRequestForUser(user.id, user.role);
      return {
        result: active
          ? JSON.stringify({ waste_type: active.waste_type, status: active.status, total_amount: active.total_amount })
          : 'No active pickup right now.',
      };
    }
    case 'cancel_pickup': {
      if (!user || user.role !== 'customer') return { result: 'Only a signed-in customer can cancel a pickup.' };
      const active = findActiveRequestForUser(user.id, 'customer');
      if (!active || active.status !== 'PENDING') return { result: 'No pending pickup to cancel.' };
      updateRequest(active.id, { status: 'CANCELLED' });
      return { result: 'Cancelled successfully.' };
    }
    case 'get_earnings': {
      if (!user || user.role !== 'collector') return { result: 'Only a signed-in collector has earnings.' };
      return { result: JSON.stringify(collectorMonthlyStats(user.id)) };
    }
    case 'start_booking_draft': {
      const draft = {
        items: (input?.types || []).map((type: string) => ({ type, kg: 0 })),
        date: input?.date ? dateFromRelative(input.date) : undefined,
        time: input?.time || undefined,
      };
      return { result: 'Booking form pre-filled — the user still needs to add quantities and confirm.', bookingDraft: draft };
    }
    default:
      return { result: 'Unknown tool.' };
  }
}

export async function POST(req: NextRequest) {
  const { message, history, lang } = await req.json().catch(() => ({}));
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  if (!openai) {
    return NextResponse.json({ message: "AI not configured.", ai: false });
  }

  const language: Language = lang === 'hi' || lang === 'kn' ? lang : 'en';
  const systemPrompt = `${SYSTEM_PROMPT}\n\n${AI_LANGUAGE_INSTRUCTION[language]}`;

  const userId = req.headers.get('x-user-id') || undefined;
  const role = (req.headers.get('x-user-role') as 'customer' | 'collector' | null) || undefined;
  const ctx = { userId, role };

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...(history || []).map((h: any) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.text,
    })),
    { role: 'user', content: message }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
      tools: TOOLS,
    });

    const assistantMessage = response.choices[0].message;
    let bookingDraft: any = undefined;

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage);
        
        for (const toolCall of assistantMessage.tool_calls as any) {
            const { result: toolResult, bookingDraft: draft } = runTool(
                toolCall.function.name,
                JSON.parse(toolCall.function.arguments),
                ctx
            );
            bookingDraft = draft;
            
            messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: toolResult
            });
        }
        
        const secondResponse = await openai.chat.completions.create({
            model: MODEL,
            messages: messages,
            tools: TOOLS,
        });
        
        return NextResponse.json({
            message: secondResponse.choices[0].message.content,
            bookingDraft,
            ai: true,
        });
    }

    return NextResponse.json({
      message: assistantMessage.content,
      bookingDraft,
      ai: true,
    });
  } catch (err) {
    console.error('AI assistant error:', err);
    return NextResponse.json({ message: "Error.", ai: false });
  }
}
