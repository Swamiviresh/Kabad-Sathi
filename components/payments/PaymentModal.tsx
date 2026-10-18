'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, QrCode, Truck, Copy, CheckCircle2, Loader2, Wallet, Clock } from 'lucide-react';

export type PaymentMethod = 'upi' | 'cod';

export interface PaymentDetails {
  requestId: string;
  amount: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (method: PaymentMethod, transactionId?: string) => void;
  details: PaymentDetails | null;
}

export default function PaymentModal({ isOpen, onClose, onPaymentComplete, details }: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [upiData, setUpiData] = useState<{ qrCode: string; upiLink: string; transactionId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);

  const generateUPIPayment = useCallback(async () => {
    if (!details) return;
    setLoading(true);
    try {
      const res = await fetch('/api/payments/create-upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: details.amount,
          orderId: details.requestId,
          customerName: details.customerName,
        }),
      });
      const data = await res.json();
      if (res.ok) setUpiData(data);
    } catch (error) {
      console.error('Failed to generate UPI payment:', error);
    } finally {
      setLoading(false);
    }
  }, [details]);

  useEffect(() => {
    if (isOpen && selectedMethod === 'upi' && !upiData) {
      generateUPIPayment();
    }
  }, [isOpen, selectedMethod, upiData, generateUPIPayment]);

  useEffect(() => {
    if (isOpen && selectedMethod === 'upi' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [isOpen, selectedMethod, timeLeft]);

  const handleCopyUPI = async () => {
    if (upiData?.upiLink) {
      await navigator.clipboard.writeText(upiData.upiLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmCOD = async () => {
    if (!details) return;
    setLoading(true);
    try {
      const res = await fetch('/api/payments/create-cod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: details.requestId, amount: details.amount }),
      });
      const data = await res.json();
      onPaymentComplete('cod', data.codId);
    } catch (error) {
      console.error('Failed to create COD:', error);
      onPaymentComplete('cod', 'COD-' + Date.now());
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUPI = () => {
    if (upiData?.transactionId) {
      onPaymentComplete('upi', upiData.transactionId);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen || !details) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-bold text-gray-800">Complete Payment</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-green-50 p-4 text-center">
          <p className="text-sm text-gray-600">Total Amount</p>
          <p className="text-3xl font-bold text-green-600">₹{details.amount}</p>
        </div>

        {!selectedMethod && (
          <div className="p-4">
            <p className="mb-4 text-center text-sm text-gray-500">Choose how you want to pay</p>
            <div className="space-y-3">
              <button
                onClick={() => setSelectedMethod('upi')}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 p-4 hover:border-green-500 hover:bg-green-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <QrCode className="h-6 w-6 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-800">Pay via UPI</p>
                  <p className="text-xs text-gray-500">Scan QR or pay with any UPI app</p>
                </div>
              </button>

              <button
                onClick={() => setSelectedMethod('cod')}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 p-4 hover:border-green-500 hover:bg-green-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                  <Truck className="h-6 w-6 text-orange-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-800">Pay on Pickup</p>
                  <p className="text-xs text-gray-500">Pay cash when collector arrives</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {selectedMethod === 'upi' && (
          <div className="p-4">
            <button onClick={() => setSelectedMethod(null)} className="mb-4 text-sm text-green-600 hover:underline">← Back</button>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                <p className="mt-4 text-sm text-gray-500">Generating QR code...</p>
              </div>
            ) : upiData ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center">
                  <div className="rounded-lg border-2 border-green-200 bg-white p-4">
                    <img src={upiData.qrCode} alt="UPI QR Code" className="h-48 w-48" />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">Scan with any UPI app</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-400">UPI link:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">{upiData.upiLink.substring(0, 50)}...</code>
                    <button onClick={handleCopyUPI} className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">
                      {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <span className={timeLeft < 60 ? 'text-red-500' : 'text-gray-600'}>
                    Expires in {formatTime(timeLeft)}
                  </span>
                </div>
                <button onClick={handleConfirmUPI} className="w-full rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-700">
                  I have completed the payment
                </button>
                <p className="text-center text-xs text-gray-400">Click after completing payment</p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-red-500">Failed to generate QR code. Please try again.</p>
                <button onClick={generateUPIPayment} className="mt-4 rounded bg-green-600 px-4 py-2 text-white">Retry</button>
              </div>
            )}
          </div>
        )}

        {selectedMethod === 'cod' && (
          <div className="p-4">
            <button onClick={() => setSelectedMethod(null)} className="mb-4 text-sm text-green-600 hover:underline">← Back</button>
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
                  <Wallet className="h-8 w-8 text-orange-600" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-800">Cash on Pickup</h3>
                <p className="text-center text-sm text-gray-600">Pay ₹{details.amount} when the collector arrives</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <h4 className="mb-2 font-bold text-amber-800">Important:</h4>
                <ul className="list-inside list-disc space-y-1 text-sm text-amber-700">
                  <li>Keep exact change ready if possible</li>
                  <li>Collector will verify and confirm the payment</li>
                  <li>You&apos;ll receive a confirmation once collected</li>
                </ul>
              </div>
              <button onClick={handleConfirmCOD} disabled={loading} className="w-full rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-700 disabled:opacity-50">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  'Confirm Cash on Pickup'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

