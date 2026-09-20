import { NextRequest, NextResponse } from 'next/server';
import {
  archiveCompletedRequest,
  findUserById,
  listRequests,
  updateRequest,
} from '../../../../lib/localdb';

export const runtime = 'nodejs';

type Role = 'customer' | 'collector';

const ACTIVE_STATUSES = ['PENDING', 'ACCEPTED', 'ON_THE_WAY'];

/**
 * The single state machine for a pickup request (local mode).
 *
 *   PENDING ── accept ──> ACCEPTED ── on_the_way ──> ON_THE_WAY ── collector: complete ──┐
 *      │                                  │                                              │
 *      └─ reject (collector, marks        └─ cancel (customer)                           │
 *         rejected_by; other collectors                                                  ▼
 *         still see it)                                  collector_confirmed_complete ──┤
 *                                                                                       │
 *                                                         customer sees Confirm button ─┤
 *                                                                                       ▼
 *                                    both confirmed → order archived to ledger + DELETED
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user) {
    return NextResponse.json({ error: 'Sign in before updating requests.' }, { status: 403 });
  }
  const role = user.role as Role;

  const existing = listRequests().find((request) => request.id === id);
  if (!existing) {
    // Deleted orders mean "already completed and archived" — tell the client to refresh.
    return NextResponse.json(
      { error: 'Request not found. It may have just been completed.', refresh: true },
      { status: 404 },
    );
  }
  if (!ACTIVE_STATUSES.includes(existing.status)) {
    return NextResponse.json({ error: 'This request is no longer active.' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  // ── per-action guards ────────────────────────────────────────────
  // NOTE: there is intentionally NO blanket "is this user part of the request" check
  // here — accept/reject must work for any collector on a PENDING request that has no
  // collector yet. Each case below enforces its own role/assignment rules.
  const isCustomer = role === 'customer' && existing.customer_id === user.id;
  const isAssignedCollector = role === 'collector' && existing.collector_id === user.id;

  switch (action) {
    // ── collector: accept a PENDING request (any collector) ──────────
    case 'accept': {
      if (role !== 'collector') {
        return NextResponse.json({ error: 'Only collectors can accept requests.' }, { status: 403 });
      }
      if (existing.status !== 'PENDING') {
        return NextResponse.json({ error: 'Someone already took this request.' }, { status: 409 });
      }
      const updated = updateRequest(id, {
        status: 'ACCEPTED',
        collector_id: user.id,
        accepted_at: new Date().toISOString(),
      });
      return NextResponse.json({ request: updated });
    }

    // ── collector: reject a PENDING request — hidden only from THIS collector ──
    case 'reject': {
      if (role !== 'collector') {
        return NextResponse.json({ error: 'Only collectors can reject requests.' }, { status: 403 });
      }
      if (existing.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only pending requests can be rejected.' }, { status: 409 });
      }
      const rejected = new Set(existing.rejected_by || []);
      rejected.add(user.id);
      const updated = updateRequest(id, { rejected_by: Array.from(rejected) });
      return NextResponse.json({ request: updated });
    }

    // ── customer: cancel while PENDING/ACCEPTED ──────────────────────
    case 'cancel': {
      if (!isCustomer) {
        return NextResponse.json({ error: 'Only the customer can cancel.' }, { status: 403 });
      }
      if (existing.status === 'ON_THE_WAY') {
        return NextResponse.json(
          { error: 'Collector is on the way — cancel from here is no longer possible.' },
          { status: 409 },
        );
      }
      const updated = updateRequest(id, { status: 'CANCELLED' });
      return NextResponse.json({ request: updated });
    }

    // ── collector: sequential ON_THE_WAY (only after ACCEPTED) ───────
    case 'on_the_way': {
      if (!isAssignedCollector) {
        return NextResponse.json(
          { error: 'Only the assigned collector can start the pickup.' },
          { status: 403 },
        );
      }
      if (existing.status !== 'ACCEPTED') {
        return NextResponse.json(
          { error: 'Mark "On the way" first — complete comes after.' },
          { status: 409 },
        );
      }
      const updated = updateRequest(id, { status: 'ON_THE_WAY' });
      return NextResponse.json({ request: updated });
    }

    // ── collector: first half of dual-confirm completion ─────────────
    case 'collector_complete': {
      if (!isAssignedCollector) {
        return NextResponse.json(
          { error: 'Only the assigned collector can mark completion.' },
          { status: 403 },
        );
      }
      // Enforce sequence: only allowed once on the way (or already heading there).
      if (existing.status !== 'ON_THE_WAY') {
        return NextResponse.json(
          { error: 'Mark "On the way" first — complete comes after.' },
          { status: 409 },
        );
      }
      if (existing.collector_confirmed_complete) {
        return NextResponse.json({ error: 'Already marked complete.' }, { status: 409 });
      }
      // NOTE: intentionally NOT setting status to COMPLETED — completion waits for the
      // customer to confirm too (dual-confirm, per spec).
      const updated = updateRequest(id, { collector_confirmed_complete: true });
      return NextResponse.json({ request: updated });
    }

    // ── customer: second half of dual-confirm completion ─────────────
    case 'customer_complete': {
      if (!isCustomer) {
        return NextResponse.json(
          { error: 'Only the customer can confirm completion.' },
          { status: 403 },
        );
      }
      if (!existing.collector_confirmed_complete) {
        return NextResponse.json(
          { error: 'The collector has not marked this complete yet.' },
          { status: 409 },
        );
      }
      if (existing.customer_confirmed_complete) {
        return NextResponse.json({ error: 'Already confirmed.' }, { status: 409 });
      }

      // Both halves done — finish the order: write the confirm flag first (so the row
      // carries a consistent COMPLETED state if anything below fails mid-write).
      const finished = updateRequest(id, {
        customer_confirmed_complete: true,
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      });
      if (!finished) {
        return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
      }
      // Archive to the monthly ledger, then hard-delete the order per spec.
      archiveCompletedRequest(finished);
      return NextResponse.json({ completed: true, deleted: true, ledgered: true });
    }

    default:
      return NextResponse.json(
        { error: 'Unknown action. Use accept/reject/cancel/on_the_way/collector_complete/customer_complete.' },
        { status: 400 },
      );
  }
}

// ── GET: fetch one request (customer or assigned collector only) ──
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 403 });

  const request = listRequests().find((r) => r.id === id);
  if (!request) {
    return NextResponse.json(
      { error: 'Request not found. It may have just been completed.', refresh: true },
      { status: 404 },
    );
  }
  const allowed = request.customer_id === user.id || request.collector_id === user.id;
  if (!allowed) return NextResponse.json({ error: 'Not your request.' }, { status: 403 });
  return NextResponse.json({ request });
}
