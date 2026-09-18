import { NextRequest, NextResponse } from 'next/server';
import { customerImpactStats, findUserById } from '../../../../lib/localdb';

export const runtime = 'nodejs';

/** All-time impact stats for the signed-in customer (ledger-backed — orders are deleted). */
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const user = userId ? findUserById(userId) : undefined;
  if (!user || user.role !== 'customer') {
    return NextResponse.json({ error: 'Only customers have impact stats.' }, { status: 403 });
  }
  return NextResponse.json({ stats: customerImpactStats(user.id) });
}
