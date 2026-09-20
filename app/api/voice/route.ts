import { NextRequest, NextResponse } from 'next/server';
import { parseVoiceCommand, dateFromRelative } from '../../../lib/voiceIntent';
import { RATES } from '../../../lib/rates';
import {
  collectorMonthlyStats,
  findActiveRequestForUser,
  findUserById,
  updateRequest,
} from '../../../lib/localdb';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { text } = await req.json().catch(() => ({}));
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'No speech text received.' }, { status: 400 });
  }

  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  const parsed = parseVoiceCommand(text);
  const { intent, entities } = parsed;

  // BOOK_PICKUP is intentionally NOT auto-submitted — the voice assistant fills the
  // booking form with the parsed date/time/scrap types and the customer still taps
  // "Request Pickup" to confirm (kg quantities and location need a human check anyway).
  if (intent === 'BOOK_PICKUP') {
    return NextResponse.json({
      ...parsed,
      message: entities.scrapTypes.length
        ? `Got it — I've filled in a pickup for ${entities.scrapTypes.join(' and ')}${
            entities.date ? ` on ${entities.date === 'today' ? 'today' : entities.date.replace('_', ' ')}` : ''
          }${entities.time ? ` in the ${entities.time.toLowerCase()}` : ''}. Please add quantities and confirm.`
        : 'I can start a pickup booking, but I could not tell which scrap type. Please fill in the details.',
    });
  }

  if (intent === 'CHECK_SCRAP_PRICE') {
    if (!entities.scrapTypes.length) {
      return NextResponse.json({
        ...parsed,
        message: `Current rates: ${Object.entries(RATES)
          .map(([type, rate]) => `${type} ₹${rate}/kg`)
          .join(', ')}.`,
      });
    }
    const lines = entities.scrapTypes.map((t) => `${t} is ₹${RATES[t]} per kg`);
    return NextResponse.json({ ...parsed, message: lines.join(', ') + '.' });
  }

  // Everything below needs a signed-in user.
  if (!user) {
    return NextResponse.json({ ...parsed, message: 'Please sign in first.' }, { status: 401 });
  }

  if (intent === 'CHECK_PICKUP_STATUS') {
    const active = findActiveRequestForUser(user.id, user.role);
    return NextResponse.json({
      ...parsed,
      message: active
        ? `Your pickup for ${active.waste_type} is currently ${active.status.replace(/_/g, ' ').toLowerCase()}.`
        : 'You have no pickup in progress right now.',
      request: active || null,
    });
  }

  if (intent === 'CANCEL_PICKUP') {
    if (user.role !== 'customer') {
      return NextResponse.json({ ...parsed, message: 'Only customers can cancel a pickup.' });
    }
    const active = findActiveRequestForUser(user.id, 'customer');
    if (!active || active.status !== 'PENDING') {
      return NextResponse.json({
        ...parsed,
        message: 'There is no pending pickup to cancel — accepted pickups need to be cancelled in-app.',
      });
    }
    updateRequest(active.id, { status: 'CANCELLED' });
    return NextResponse.json({ ...parsed, message: 'Your pickup has been cancelled.' });
  }

  if (intent === 'CHECK_EARNINGS') {
    if (user.role !== 'collector') {
      return NextResponse.json({ ...parsed, message: 'Earnings are only available for collectors.' });
    }
    const stats = collectorMonthlyStats(user.id);
    return NextResponse.json({
      ...parsed,
      message: `This month you've earned ₹${stats.totalEarnings} from ${stats.totalPickups} pickups.`,
      stats,
    });
  }

  return NextResponse.json({
    ...parsed,
    message: "Sorry, I didn't understand that. Try things like 'book a pickup' or 'what's the price of metal'.",
  });
}
