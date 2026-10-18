import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { orderId, amount } = await req.json();

    if (!orderId || !amount) {
      return NextResponse.json(
        { error: 'OrderId and amount are required' },
        { status: 400 }
      );
    }

    // Generate COD confirmation ID
    const codId = `COD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return NextResponse.json({
      codId,
      orderId,
      amount,
      status: 'pending',
      message: 'Cash on Delivery confirmed. Please keep exact change ready.',
    });
  } catch (error) {
    console.error('COD Payment Error:', error);
    return NextResponse.json(
      { error: 'Failed to create COD order' },
      { status: 500 }
    );
  }
}
