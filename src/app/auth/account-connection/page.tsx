'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/use-wallet';
import { supabase, getSession } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AccountConnectionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const { 
    isConnected: cryptoConnected, 
    isConnecting: cryptoLoading, 
    connectWallet, 
    address, 
    error: walletError
  } = useWallet();
  const [currentStep, setCurrentStep] = useState(2); // Assuming this is step 2 in the flow
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  const handleContinue = () => {
    setIsLoading(true);
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
    // Use the wallet hook to connect to Reown
    try {
      await connectWallet();
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };
  
  // Re-add the useEffect hook to update Supabase profile
  useEffect(() => {
    const updateUserProfile = async () => {
      if (cryptoConnected && address) {
        console.log('Wallet connected, attempting to save:', address);
        setIsUpdatingProfile(true);
        
        try {
          // Get current user session
          // Correctly destructure data and error from the helper
          const { data: sessionData, error: sessionError } = await getSession();
          
          if (sessionError) {
            if (sessionError instanceof Error) {
              throw new Error(`Error getting session: ${sessionError.message}`);
            } else {
              throw new Error('An unknown error occurred while getting the session.');
            }
          }
          
          // Extract the actual session object from the data property
          const session = sessionData; 

          if (!session?.user?.id) {
              throw new Error('User not logged in for profile update.');
          }
  
          const userId = session.user.id;
  
          // Update the user's profile in Supabase
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
                wallet_address: address,
                updated_at: new Date().toISOString() // Also update timestamp
             })
            .eq('id', userId); // Match using the 'id' column
  
          if (updateError) {
            console.error('Error updating profile:', updateError);
            toast.error(`Failed to save wallet: ${updateError.message}`);
          } else {
            console.log('User profile updated with wallet address.');
            toast.success('Wallet address saved!');
          }
        } catch (error) {
          console.error('Failed to update user profile:', error);
          // Use toast for user feedback on general errors too
          if (error instanceof Error) {
            toast.error(`Error: ${error.message}`);
          } else {
            toast.error('An unknown error occurred while saving wallet.');
          }
        } finally {
          setIsUpdatingProfile(false);
        }
      }
    };
  
    updateUserProfile();
    
  }, [cryptoConnected, address]);
  
  // Reset loading state if connection attempt fails
  useEffect(() => {
    if (!cryptoLoading && !cryptoConnected) {
      setIsLoading(false);
    }
  }, [cryptoLoading, cryptoConnected]);

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
            
            {/* Wallet Connection Section */}
            <Button 
              onClick={handleConnectCrypto}
              className="w-full flex items-center justify-center gap-2 bg-black text-white border border-white hover:bg-black/90"
              variant="outline"
              disabled={cryptoLoading || cryptoConnected} // Keep disabled when connected
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
              {/* Show connected checkmark when connected */}
              {cryptoConnected && (
                <div className="ml-auto text-green-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
              )}
            </Button>
            
            {/* Display truncated wallet address when connected */}
            {cryptoConnected && address && (
              <div className="mt-2 text-sm text-center text-gray-500">
                Connected wallet: {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
            
            {/* Display wallet error if any */}
            {walletError && (
              <div className="mt-2 text-sm text-center text-red-500">
                Error: {walletError.message}
              </div>
            )}
            {/* Re-add profile update status display */}
            {isUpdatingProfile && (
                <div className="mt-2 text-sm text-center text-gray-500">
                    Saving wallet address...
                </div>
            )}
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