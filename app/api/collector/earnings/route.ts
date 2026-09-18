import { NextRequest, NextResponse } from 'next/server';
import { collectorMonthlyStats, findUserById } from '../../../../lib/localdb';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const collectorId = req.headers.get('x-user-id') || req.nextUrl.searchParams.get('collectorId');
  const user = collectorId ? findUserById(collectorId) : undefined;
  if (!user || user.role !== 'collector') {
    return NextResponse.json({ error: 'Only collectors have an earnings dashboard.' }, { status: 403 });
  }

  const stats = collectorMonthlyStats(collectorId as string);
  return NextResponse.json({ stats, month: new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }) });
}
