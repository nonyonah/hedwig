'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CreditCardIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

export default function PaymentPage() {
  const searchParams = useSearchParams();
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'success' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState('');
  
  const invoiceId = searchParams?.get('invoiceId') || '';
  const amount = searchParams?.get('amount') || '0';
  const description = searchParams?.get('description') || '';
  const clientName = searchParams?.get('clientName') || '';
  const clientEmail = searchParams?.get('clientEmail') || '';

  const handlePayment = async () => {
    setPaymentStatus('processing');
    
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Record payment
      const response = await fetch(`/api/pay/${invoiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionHash: `tx_${Date.now()}`, // Simulate transaction hash
          paymentMethod: 'card',
          amount: parseFloat(amount || '0'),
        }),
      });

      if (response.ok) {
        setPaymentStatus('success');
      } else {
        throw new Error('Payment failed');
      }
    } catch (error) {
      setPaymentStatus('error');
      setErrorMessage('Payment processing failed. Please try again.');
    }
  };

  if (paymentStatus === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-2xl text-green-700">Payment Successful!</CardTitle>
            <CardDescription>
              Your payment has been processed successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Invoice #{invoiceId} has been marked as paid.
            </p>
            <Button 
              onClick={() => window.close()} 
              className="w-full"
              style={{ backgroundColor: '#a2d2ff', borderColor: '#a2d2ff' }}
            >
              Close
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentStatus === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <ExclamationCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-2xl text-red-700">Payment Failed</CardTitle>
            <CardDescription>
              {errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              onClick={() => setPaymentStatus('pending')} 
              className="w-full mb-2"
              style={{ backgroundColor: '#a2d2ff', borderColor: '#a2d2ff' }}
            >
              Try Again
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.close()} 
              className="w-full"
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCardIcon className="w-5 h-5" />
            Payment Details
          </CardTitle>
          <CardDescription>
            Complete your payment for invoice #{invoiceId}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Invoice Details</Label>
            <div className="bg-gray-50 p-3 rounded-lg space-y-1">
              <p className="text-sm"><strong>Description:</strong> {description}</p>
              <p className="text-sm"><strong>Client:</strong> {clientName}</p>
              <p className="text-sm"><strong>Email:</strong> {clientEmail}</p>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label>Amount Due</Label>
            <div className="text-2xl font-bold" style={{ color: '#a2d2ff' }}>
              ${amount}
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <Label>Payment Method</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="border-2 border-blue-200 rounded-lg p-3 text-center bg-blue-50">
                <CreditCardIcon className="w-6 h-6 mx-auto mb-1 text-blue-600" />
                <span className="text-sm font-medium">Card</span>
              </div>
              <div className="border rounded-lg p-3 text-center opacity-50">
                <span className="text-sm">Crypto</span>
                <p className="text-xs text-gray-500">Coming Soon</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input 
              id="cardNumber" 
              placeholder="1234 5678 9012 3456" 
              className="font-mono"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiry">Expiry</Label>
              <Input id="expiry" placeholder="MM/YY" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cvc">CVC</Label>
              <Input id="cvc" placeholder="123" />
            </div>
          </div>
          
          <Button 
            onClick={handlePayment} 
            className="w-full" 
            disabled={paymentStatus === 'processing'}
            style={{ backgroundColor: '#a2d2ff', borderColor: '#a2d2ff' }}
          >
            {paymentStatus === 'processing' ? 'Processing...' : `Pay $${amount}`}
          </Button>
          
          <p className="text-xs text-gray-500 text-center">
            Your payment is secured with 256-bit SSL encryption
          </p>
        </CardContent>
      </Card>
    </div>
  );
}