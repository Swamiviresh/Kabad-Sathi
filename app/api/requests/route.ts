import { NextRequest, NextResponse } from 'next/server';
import {
  findUserById,
  insertRequest,
  listRequests,
  publicUsersByIds,
} from '../../../lib/localdb';
import { calcTotal, summaryType, totalKg, WASTE_TYPES, type Item } from '../../../lib/rates';

export const runtime = 'nodejs';

/**
 * GET /api/requests — role-scoped listing:
 *   • customers see only their own requests (any status)
 *   • collectors see all PENDING requests they haven't rejected, plus requests
 *     assigned to them (ACCEPTED / ON_THE_WAY / dual-confirm in progress)
 *   • the request body stays alive in db.json until both sides confirm completion,
 *     at which point it is archived to the ledger and deleted server-side.
 *
 * Contact sharing: each accepted request (`ACCEPTED`/`ON_THE_WAY`) is enriched with a
 * `counterparty` object containing the other side's public profile (name, phone, role).
 * Pending requests carry NO contact info — the two parties only see each other's
 * details once a collector has accepted the order.
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user) {
    return NextResponse.json({ error: 'Sign in to view requests.' }, { status: 401 });
  }

  const all = listRequests();
  let requests;
  if (user.role === 'collector') {
    requests = all.filter((r) => {
      if (r.rejected_by?.includes(user.id)) return false;
      if (r.status === 'PENDING') return true;
      return r.collector_id === user.id;
    });
  } else {
    requests = all.filter((r) => r.customer_id === user.id);
  }

  // Attach counterparty contact info ONLY for accepted orders (per spec: contact
  // details are shared once the collector has accepted).
  const accepted = requests.filter(
    (r) => r.collector_id && r.customer_id && ['ACCEPTED', 'ON_THE_WAY'].includes(r.status),
  );
  const contacts = publicUsersByIds(
    accepted.flatMap((r) => [r.customer_id as string, r.collector_id as string]),
  );
  const enriched = requests.map((r) => {
    if (!r.collector_id || !r.customer_id || !['ACCEPTED', 'ON_THE_WAY'].includes(r.status)) {
      return r;
    }
    const otherId = user.id === r.customer_id ? r.collector_id : r.customer_id;
    const other = contacts[otherId];
    return other ? { ...r, counterparty: other } : r;
  });

  return NextResponse.json({ requests: enriched });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user || user.role !== 'customer') {
    return NextResponse.json({ error: 'Only signed-in customers can create requests.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.latitude == null || body.longitude == null) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }
  const items = Array.isArray(body.items)
    ? body.items
        .map((item: Partial<Item>) => ({
          type: String(item.type || ''),
          kg: Number(item.kg),
        }))
        .filter((item: Item) => WASTE_TYPES.includes(item.type) && Number.isFinite(item.kg) && item.kg > 0)
    : [];
  if (!items.length) {
    return NextResponse.json({ error: 'Add at least one valid item.' }, { status: 400 });
  }

  // The order is broadcast: it stays PENDING with no collector attached until some
  // collector accepts it from their dashboard.
  const request = insertRequest({
    customer_id: user.id,
    collector_id: null,
    waste_type: summaryType(items),
    quantity: `${totalKg(items)} kg`,
    items,
    total_amount: calcTotal(items),
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    address: body.address,
    pickup_date: body.pickup_date,
    pickup_time: body.pickup_time,
    notes: body.notes,
    status: 'PENDING',
    rejected_by: [],
    collector_confirmed_complete: false,
    customer_confirmed_complete: false,
  });
  return NextResponse.json({ request });
}
