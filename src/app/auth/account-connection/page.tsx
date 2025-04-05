'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';

export default function AccountConnectionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [cryptoConnected, setCryptoConnected] = useState(false);
  const [currentStep, setCurrentStep] = useState(2); // Assuming this is step 2 in the flow
  
  const handleContinue = () => {
    // Navigate to the dashboard or next page
    router.push('/dashboard');
  };
  
  // Check if any account is connected to enable the continue button
  const accountConnected = bankConnected || cryptoConnected;

  const handleConnectBank = async () => {
    setBankLoading(true);
    
    // Here you would implement bank account connection
    // For now, we'll just simulate a successful connection
    setTimeout(() => {
      setBankLoading(false);
      setBankConnected(true);
      // No longer automatically navigating to dashboard
    }, 1500);
  };

  const handleConnectCrypto = async () => {
    setCryptoLoading(true);
    
    // Here you would implement crypto wallet connection
    // For now, we'll just simulate a successful connection
    setTimeout(() => {
      setCryptoLoading(false);
      setCryptoConnected(true);
      // No longer automatically navigating to dashboard
    }, 1500);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Let's connect your accounts</CardTitle>
          <CardDescription>
            Get a complete view of your finances with your accounts and wallets in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <Button 
              onClick={handleConnectBank}
              className="w-full flex items-center justify-center gap-2 bg-black text-white border border-white hover:bg-black/90"
              variant="outline"
              disabled={bankLoading || bankConnected}
            >
              <div className="font-medium">{bankConnected ? 'Connected' : 'Connect Account'}</div>
              {bankLoading && (
                <div className="ml-auto">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
              {bankConnected && (
                <div className="ml-auto text-green-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
              )}
            </Button>
            
            <Button 
              onClick={handleConnectCrypto}
              className="w-full flex items-center justify-center gap-2 bg-black text-white border border-white hover:bg-black/90"
              variant="outline"
              disabled={cryptoLoading || cryptoConnected}
            >
              <div className="font-medium">{cryptoConnected ? 'Connected' : 'Connect Wallet'}</div>
              {cryptoLoading && (
                <div className="ml-auto">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
              {cryptoConnected && (
                <div className="ml-auto text-green-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
              )}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button 
            onClick={handleContinue} 
            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-200 dark:hover:bg-gray-300 dark:text-gray-800" 
            variant="outline"
            disabled={!accountConnected || isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 dark:text-gray-100" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </div>
            ) : 'Continue'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}