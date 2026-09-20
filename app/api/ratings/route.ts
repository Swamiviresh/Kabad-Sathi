import { NextRequest, NextResponse } from 'next/server';
import {
  addRating,
  findLedgerEntry,
  findUserById,
  hasRatingForPickup,
  listRequests,
} from '../../../lib/localdb';

export const runtime = 'nodejs';

/**
 * POST /api/ratings — rate the collector on a COMPLETED pickup.
 * Completed orders are hard-deleted per spec, so the pickup may live in the ledger
 * instead of `requests` — check both. One rating per pickup.
 */
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user || user.role !== 'customer') {
    return NextResponse.json({ error: 'Only customers can leave a rating.' }, { status: 403 });
  }

  const { pickup_id, rating, review } = await req.json().catch(() => ({}));
  const score = Number(rating);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: 'Rating must be an integer from 1 to 5.' }, { status: 400 });
  }
  if (!pickup_id) {
    return NextResponse.json({ error: 'pickup_id is required.' }, { status: 400 });
  }
  if (hasRatingForPickup(pickup_id)) {
    return NextResponse.json({ error: 'This pickup has already been rated.' }, { status: 409 });
  }

  // Case 1: order still exists (completed, not yet archived) — shouldn't normally happen
  // since archiving is atomic with completion, but kept for safety.
  const live = listRequests().find((r) => r.id === pickup_id);
  if (live) {
    if (live.customer_id !== user.id || !live.collector_id) {
      return NextResponse.json({ error: 'This pickup cannot be rated.' }, { status: 400 });
    }
    const saved = addRating({
      pickup_id,
      customer_id: user.id,
      collector_id: live.collector_id,
      rating: score,
      review,
    });
    return NextResponse.json({ rating: saved });
  }

  // Case 2: order completed + deleted — resolve collector from the ledger.
  const entry = findLedgerEntry(pickup_id);
  if (!entry || entry.customer_id !== user.id || !entry.collector_id) {
    return NextResponse.json({ error: 'This pickup cannot be rated.' }, { status: 400 });
  }
  const saved = addRating({
    pickup_id,
    customer_id: user.id,
    collector_id: entry.collector_id,
    rating: score,
    review,
  });
  return NextResponse.json({ rating: saved });
}
