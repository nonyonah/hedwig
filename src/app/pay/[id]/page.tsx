'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function PaymentPage({ params }: { params: { id: string } }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated, user, login } = usePrivy();
  
  const amount = searchParams.get('amount') || '';
  const currency = searchParams.get('currency') || '';
  const description = searchParams.get('description') || '';
  
  const handlePayment = async () => {
    if (!authenticated || !user?.wallet?.address) {
      setError('Please connect your wallet first');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // In a real implementation, you would call an API to process the payment
      // For now, we'll just simulate a successful payment after a delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setIsComplete(true);
    } catch (err) {
      console.error('Payment error:', err);
      setError('Failed to process payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image src="/logo.png" alt="Albus Logo" width={120} height={60} priority className="mx-auto" />
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Payment Request</CardTitle>
            <CardDescription>
              {description ? description : `Payment for ${amount} ${currency}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Amount:</span>
                <span className="font-semibold">{amount} {currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payment ID:</span>
                <span className="font-mono text-sm">{params.id}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {error && (
              <div className="w-full p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                {error}
              </div>
            )}
            
            {isComplete ? (
              <div className="w-full">
                <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-600 text-sm mb-4">
                  Payment completed successfully!
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => router.push('/overview')}
                >
                  Return to Dashboard
                </Button>
              </div>
            ) : (
              <>
                {authenticated && user?.wallet ? (
                  <Button 
                    className="w-full" 
                    onClick={handlePayment}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Pay ${amount} ${currency}`
                    )}
                  </Button>
                ) : (
                  <Button 
                    className="w-full" 
                    onClick={login}
                  >
                    Connect Wallet to Pay
                  </Button>
                )}
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
} 