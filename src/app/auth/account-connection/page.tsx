'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { supabase, getSession } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatAddress } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AccountConnectionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [cryptoConnected, setCryptoConnected] = useState(false);
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(2);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  
  const handleContinue = () => {
    setIsLoading(true);
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
    }, 1500);
  };

  const handleConnectCrypto = async () => {
    try {
      setCryptoLoading(true);
      // TODO: Implement wallet connection
      setCryptoConnected(true);
      setAddress('0x123...abc');
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
    } finally {
      setCryptoLoading(false);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      setCryptoConnected(false);
      setAddress(null);
      toast.success('Wallet disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      toast.error('Failed to disconnect wallet');
    }
  };
  
  // Update display name when wallet connects
  useEffect(() => {
    if (address) {
      setDisplayName(formatAddress(address));
    }
  }, [address]);

  // Update Supabase profile when wallet connects
  useEffect(() => {
    const updateUserProfile = async () => {
      if (cryptoConnected && address) {
        setIsUpdatingProfile(true);
        
        try {
          const { data: sessionData, error: sessionError } = await getSession();
          
          if (sessionError) {
            throw new Error(`Error getting session: ${sessionError.message}`);
          }
          
          const session = sessionData;
          if (!session?.user?.id) {
            throw new Error('User not logged in for profile update.');
          }

          const userId = session.user.id;

          // Update the user's profile in Supabase with wallet info
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              wallet_address: address,
              display_name: displayName,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (updateError) {
            throw new Error(`Failed to save wallet info: ${updateError.message}`);
          }

          toast.success('Wallet connected successfully!');
        } catch (err) {
          console.error('Error updating profile:', err);
          toast.error('Failed to save wallet information');
        } finally {
          setIsUpdatingProfile(false);
        }
      }
    };

    updateUserProfile();
  }, [cryptoConnected, address, displayName]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Connect Your Accounts</CardTitle>
          <CardDescription>
            Link your bank and crypto accounts to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">Bank Account</h3>
            <Button
              onClick={handleConnectBank}
              disabled={bankLoading || bankConnected}
              className="w-full"
              variant="secondary"
            >
              {bankLoading ? 'Connecting...' : bankConnected ? 'Connected' : 'Connect Bank Account'}
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Wallet</h3>
            {cryptoConnected ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="w-full"
                    variant="secondary"
                  >
                    {displayName || formatAddress(address || '')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleDisconnectWallet}>
                    Disconnect Wallet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={handleConnectCrypto}
                disabled={cryptoLoading || isLoading}
                className="w-full"
                variant="secondary"
              >
                {cryptoLoading || isLoading ? 'Connecting...' : 'Connect Wallet'}
              </Button>
            )}
          </div>
        </CardContent>
        <CardContent>
          <Button
            onClick={handleContinue}
            disabled={!accountConnected || isLoading}
            className="w-full"
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}