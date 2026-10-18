import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const transactionId = searchParams.get('transactionId');

  if (!transactionId) {
    return NextResponse.json(
      { error: 'Transaction ID is required' },
      { status: 400 }
    );
  }

  // Mock status check - in production, query your payment gateway
  const isCompleted = Math.random() > 0.5;

  return NextResponse.json({
    transactionId,
    status: isCompleted ? 'completed' : 'pending',
    timestamp: Date.now(),
  });
}
