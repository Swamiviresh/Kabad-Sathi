import { NextRequest, NextResponse } from 'next/server';
import { findUserById, optInToRewards, redeemReward, rewardsSummary } from '../../../lib/localdb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/rewards — points balance, tier, streak and redemption history. */
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user) {
    return NextResponse.json({ error: 'Sign in to see your rewards.' }, { status: 401 });
  }
  return NextResponse.json({ rewards: rewardsSummary(user.id) });
}

/**
 * POST /api/rewards — redeem one reward by id.
 *
 * The cost check runs server-side against the ledger-derived balance, never against a
 * number sent by the client, so a tampered request can't mint a voucher.
 */
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user) {
    return NextResponse.json({ error: 'Sign in to redeem rewards.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // ── join Green Points from the rewards page (registration already covers new users) ──
  if (body.action === 'opt_in') {
    if (user.role !== 'customer') {
      return NextResponse.json({ error: 'Rewards are for customer accounts.' }, { status: 403 });
    }
    const result = optInToRewards(user.id);
    return NextResponse.json({ optIn: result, rewards: rewardsSummary(user.id) });
  }

  const rewardId = String(body.rewardId || '');
  if (!rewardId) {
    return NextResponse.json({ error: 'Pick a reward to redeem.' }, { status: 400 });
  }

  const { redemption, error } = redeemReward(user.id, rewardId);
  if (error) return NextResponse.json({ error }, { status: 409 });

  return NextResponse.json({ redemption, rewards: rewardsSummary(user.id) });
}
