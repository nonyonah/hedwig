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
  const [accountConnected, setAccountConnected] = useState(false);
  const [currentStep, setCurrentStep] = useState(2); // Assuming this is step 2 in the flow
  
  const handleContinue = () => {
    // Navigate to the dashboard or next page
    router.push('/dashboard');
  };

  const handleConnectBank = async () => {
    setBankLoading(true);
    
    // Here you would implement bank account connection
    // For now, we'll just simulate a successful connection
    setTimeout(() => {
      setBankLoading(false);
      setAccountConnected(true);
      // No longer automatically navigating to dashboard
    }, 1500);
  };

  const handleConnectCrypto = async () => {
    setCryptoLoading(true);
    
    // Here you would implement crypto wallet connection
    // For now, we'll just simulate a successful connection
    setTimeout(() => {
      setCryptoLoading(false);
      setAccountConnected(true);
      // No longer automatically navigating to dashboard
    }, 1500);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
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
              className="w-full h-10 flex items-center justify-center px-4 bg-white text-black hover:bg-gray-100 border border-gray-200"
              variant="outline"
              disabled={bankLoading}
            >
              <div className="flex items-center">
                <div className="bg-blue-100 p-2 rounded-full mr-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 18V13C19 11.8954 18.1046 11 17 11H7C5.89543 11 5 11.8954 5 13V18" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 7C13.1046 7 14 6.10457 14 5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5C10 6.10457 10.8954 7 12 7Z" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 21H21" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-center">
                  <div className="font-medium">Connect Account</div>
                </div>
              </div>
              {bankLoading && (
                <div className="ml-auto">
                  <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
            </Button>
            
            <Button 
              onClick={handleConnectCrypto}
              className="w-full h-10 flex items-center justify-center px-4 bg-white text-black hover:bg-gray-100 border border-gray-200"
              variant="outline"
              disabled={cryptoLoading}
            >
              <div className="flex items-center">
                <div className="bg-purple-100 p-2 rounded-full mr-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 9.354C14.4692 8.8232 13.764 8.49976 13 8.5C11.3431 8.5 10 9.84315 10 11.5C10 13.1569 11.3431 14.5 13 14.5C13.764 14.5002 14.4692 14.1768 15 13.646" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 10.5H17" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 12.5H17" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-center">
                  <div className="font-medium">Connect Wallet</div>
                </div>
              </div>
              {cryptoLoading && (
                <div className="ml-auto">
                  <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button 
            onClick={handleContinue} 
            className="w-full h-10" 
            disabled={!accountConnected || isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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