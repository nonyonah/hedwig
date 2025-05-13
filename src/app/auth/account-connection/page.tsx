'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import OnboardingAgent from '@/components/OnboardingAgent';
import { loadAndInitMonoConnect, saveBankConnection, hasBankAccount } from '@/lib/mono-connect';

export default function AccountConnectionPage() {
  const router = useRouter();
  const { user } = useUser();
  const [bankConnected, setBankConnected] = useState(false);
  const [isWalletOnlySignIn, setIsWalletOnlySignIn] = useState(false);

  // Check for existing bank connection
  useEffect(() => {
    const checkUserAccounts = async () => {
      if (user?.id) {
        // Check if user has a bank account connected
        const hasBank = await hasBankAccount();
        setBankConnected(hasBank);
        
        // Check if this is a wallet-only sign in
        const walletParam = new URLSearchParams(window.location.search).get('wallet_only');
        setIsWalletOnlySignIn(walletParam === 'true');
        
        // If user has a bank account, redirect to dashboard
        if (hasBank) {
          router.push('/overview');
        }
      }
    };

    checkUserAccounts();
  }, [user, router]);

  // Use the consolidated Mono Connect approach
  const openMonoWidget = useCallback(async () => {
    try {
      const monoInstance = await loadAndInitMonoConnect(
        async (code) => {
          console.log(`Linked successfully: ${code}`);
          
          // Update the user's profile to mark bank as connected
          if (user?.id) {
            const success = await saveBankConnection(code);
            if (success) {
              setBankConnected(true);
              // Redirect to dashboard after successful connection
              router.push('/overview');
            }
          }
        },
        () => console.log('Widget closed')
      );
      
      if (monoInstance) {
        monoInstance.open();
      }
    } catch (error) {
      console.error('Error loading Mono Connect:', error);
    }
  }, [user, router]);

  const handleContinue = () => {
    router.push('/overview');
  };

  const handleSkipBankConnection = () => {
    router.push('/overview');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Connect Your Bank Account</CardTitle>
          <CardDescription>
            Connect your bank account to complete your profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bank Account Connection Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Bank Account Connection</h3>
            <p className="text-sm text-muted-foreground">
              Connect your Nigerian bank account to track your finances
            </p>
            
            {!bankConnected ? (
              <div className="flex flex-col gap-3">
                <Button 
                  onClick={openMonoWidget} 
                  variant="outline"
                  className="w-full"
                >
                  Link Account
                </Button>
                
                <div className="flex items-center justify-center text-xs text-gray-500 mt-1">
                  <span>powered by</span>
                  <img 
                    src="/mono (2).svg" 
                    alt="Mono" 
                    width="16" 
                    height="16" 
                    className="ml-1" 
                  />
                </div>
                
                <button 
                  onClick={handleSkipBankConnection} 
                  className="text-sm text-gray-500 hover:text-gray-700 mt-2 text-center w-full"
                >
                  Skip
                </button>
              </div>
            ) : (
              <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm">
                Bank account connected successfully!
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={handleContinue} 
            className="w-full"
          >
            Continue to Dashboard
          </Button>
        </CardFooter>
      </Card>
      <OnboardingAgent />
    </div>
  );
}