import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY?.trim();
const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
const aiConfigured = Boolean(GOOGLE_API_KEY);
const aiKeyLooksValid = GOOGLE_API_KEY != null && (GOOGLE_API_KEY.startsWith('AIza') || GOOGLE_API_KEY.startsWith('AQ'));

/**
 * GET /api/ai-status — a one-call answer to "is my key actually loaded?".
 */
export async function GET() {
  return NextResponse.json({
    configured: aiConfigured,
    keyFormatValid: aiKeyLooksValid,
    model: MODEL,
    hint: aiConfigured
      ? aiKeyLooksValid
        ? 'AI features are live.'
        : 'A key is set but does not start with "AIza" or "AQ". Double-check you copied the whole key.'
      : 'No key found. Add GOOGLE_API_KEY=AIza... to .env.local, then restart `npm run dev`.',
  });
}
