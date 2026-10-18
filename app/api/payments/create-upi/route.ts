import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { amount, orderId, customerName } = await req.json();

    if (!amount || !orderId) {
      return NextResponse.json(
        { error: 'Amount and orderId are required' },
        { status: 400 }
      );
    }

    // Get UPI ID from environment variable
    const upiId = process.env.UPI_ID || 'kabad-sathi@upi';
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create UPI deep link
    const upiLink = `upi://pay?pa=${upiId}&pn=KabadSathi&am=${amount}&tr=${transactionId}&tn=Payment for Order ${orderId}`;
    
    // Generate QR code using qrcode-generator (simplified - would use actual QR library)
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;

    return NextResponse.json({
      qrCode,
      upiLink,
      transactionId,
      amount,
      orderId,
    });
  } catch (error) {
    console.error('UPI Payment Error:', error);
    return NextResponse.json(
      { error: 'Failed to create UPI payment' },
      { status: 500 }
    );
  }
}
