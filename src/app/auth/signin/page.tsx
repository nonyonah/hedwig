'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { inAppWallet, createWallet } from "thirdweb/wallets";
import { sepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import { useConnectModal } from "thirdweb/react";
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Remove unused Separator import
// import { Separator } from "@/components/ui/separator";


// Add Image import for Next.js optimization
import Image from 'next/image';

export default function SignInPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("social");
  // Remove unused isConnecting variable or use destructuring with underscore
  const { connect /* , isConnecting */ } = useConnectModal();

  // Initialize ThirdWeb client
  const thirdwebClient = createThirdwebClient({
    clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || '',
  });

  const handleSocialSignIn = async (strategy: "google" | "apple") => {
    // Updated parameter type to remove passkey
    setIsLoading(true);
    
    try {
      // Create an in-app wallet with smart account capabilities
      const wallet = inAppWallet({
        smartAccount: {
          chain: sepolia,
          sponsorGas: true,
        }
      });

      // Connect using the wallet UI with selected authentication strategy
      // Remove passkey condition
      await wallet.connect({
        client: thirdwebClient,
        strategy: strategy as "google" | "apple"
      });

      const account = await wallet.getAccount();

      if (account) {
        const walletAddress = account.address;
        
        // Check if the wallet address exists in our database
        const { data, error } = await supabase
          .from('profiles')
          .select('id, wallet_address, bank_account_connected')
          .eq('wallet_address', walletAddress)
          .single();

        if (error || !data) {
          // Wallet not found, create a new user profile
          // Use underscore to indicate intentionally unused variable
          const { /* data: newUser, */ error: createError } = await supabase
            .from('profiles')
            .insert({
              wallet_address: walletAddress,
              wallet_created_at: new Date().toISOString(),
            })
            .select();

          if (createError) {
            console.error('Error creating user profile:', createError);
            toast.error("Failed to create user profile");
            return;
          }

          // Redirect to account connection page for new users
          router.push('/auth/account-connection?wallet_only=true');
        } else {
          // Existing user - check if they have connected a bank account
          if (data.bank_account_connected) {
            // User has completed onboarding, go to dashboard
            router.push('/overview');
          } else {
            // User needs to connect bank account
            router.push('/auth/account-connection?wallet_only=true');
          }
        }
      }
    } catch (error) {
      console.error('Error handling sign-in:', error);
      toast.error("Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExistingWalletConnect = async () => {
    setIsLoading(true);
    
    try {
      // Define the wallets to show in the connect modal
      // Excluding inAppWallet as requested
      const wallets = [
        createWallet("io.metamask"),
        createWallet("com.coinbase.wallet"),
        createWallet("me.rainbow"),
      ];
      
      // Use the connect modal hook with specific wallets
      const wallet = await connect({ 
        client: thirdwebClient,
        wallets
      });
      
      if (wallet) {
        const account = await wallet.getAccount();
        
        if (account) {
          const walletAddress = account.address;
          
          // Check if the wallet address exists in our database
          const { data, error } = await supabase
            .from('profiles')
            .select('id, wallet_address, bank_account_connected')
            .eq('wallet_address', walletAddress)
            .single();
  
          if (error || !data) {
            // Wallet not found, create a new user profile
            // Use underscore to indicate intentionally unused variable
            const { /* data: newUser, */ error: createError } = await supabase
              .from('profiles')
              .insert({
                wallet_address: walletAddress,
                wallet_created_at: new Date().toISOString(),
              })
              .select();
  
            if (createError) {
              console.error('Error creating user profile:', createError);
              toast.error("Failed to create user profile");
              return;
            }
  
            // Redirect to account connection page for new users
            router.push('/auth/account-connection?wallet_only=true');
          } else {
            // Existing user - check if they have connected a bank account
            if (data.bank_account_connected) {
              // User has completed onboarding, go to dashboard
              router.push('/overview');
            } else {
              // User needs to connect bank account
              router.push('/auth/account-connection?wallet_only=true');
            }
          }
        } else {
          toast.error("Failed to get wallet account");
        }
      } else {
        // Handle case where wallet connection was cancelled or failed
        toast.error("Wallet connection cancelled or failed");
      }
    } catch (error) {
      console.error('Error handling wallet connect:', error);
      toast.error("Wallet connection failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl font-bold">Albus</CardTitle>
          <CardDescription>
            Track your finances on and offchain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="social" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="social">Social Login</TabsTrigger>
              <TabsTrigger value="wallet">Connect Wallet</TabsTrigger>
            </TabsList>
            
            <TabsContent value="social" className="space-y-4">
              <div className="grid gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleSocialSignIn('google')} 
                  disabled={isLoading}
                >
                  <Image src="/google.svg" alt="Google" width={20} height={20} className="mr-2" />
                  Continue with Google
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => handleSocialSignIn('apple')} 
                  disabled={isLoading}
                >
                  <Image src="/apple.svg" alt="Apple" width={20} height={20} className="mr-2" />
                  Continue with Apple
                </Button>
                
                {/* Passkey button removed */}
                
              </div>
            </TabsContent>
            
            <TabsContent value="wallet" className="space-y-4">
              <Button 
                variant="outline" 
                onClick={handleExistingWalletConnect} 
                disabled={isLoading}
                className="w-full"
              >
                Connect Existing Wallet
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-center pt-0">
        </CardFooter>
      </Card>
    </div>
  );
}
