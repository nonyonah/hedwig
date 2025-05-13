'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { inAppWallet } from "thirdweb/wallets";
import { sepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export default function SignInPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("social");

  // Initialize ThirdWeb client
  const thirdwebClient = createThirdwebClient({
    clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || '',
  });

  const handleSocialSignIn = async (strategy: "google" | "apple" | "passkey") => {
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
      if (strategy === "passkey") {
        await wallet.connect({
          client: thirdwebClient,
          strategy: strategy,
          type: "sign-in" // Required for passkey
        });
      } else {
        // For Google and Apple
        await wallet.connect({
          client: thirdwebClient,
          strategy: strategy as "google" | "apple"
        });
      }

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
          const { data: newUser, error: createError } = await supabase
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
      // Create an in-app wallet with smart account capabilities for existing wallets
      const wallet = inAppWallet({
        smartAccount: {
          chain: sepolia,
          sponsorGas: true,
        }
      });
      
      // Connect to the wallet without specifying a strategy to use browser wallets
      await wallet.connect({
        client: thirdwebClient,
        // No strategy specified - will use browser wallets
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
          const { data: newUser, error: createError } = await supabase
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
            
            <TabsContent value="social" className="space-y-3">
              <Button 
                type="button" 
                variant="default" 
                className="w-full flex items-center justify-center gap-2 bg-[#240046] hover:bg-[#240046]/90" 
                onClick={() => handleSocialSignIn("google")}
                disabled={isLoading}
              >
                {isLoading ? (
                  'Signing in...'
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign in with Google
                  </>
                )}
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                className="w-full flex items-center justify-center gap-2 border-[#240046] text-[#240046] hover:bg-[#240046]/10" 
                onClick={() => handleSocialSignIn("apple")}
                disabled={isLoading}
              >
                {isLoading ? (
                  'Signing in...'
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.05 12.536c-.02-2.075 1.699-3.085 1.777-3.131-0.969-1.419-2.476-1.613-3.009-1.631-1.269-0.132-2.499 0.754-3.146 0.754-0.654 0-1.649-0.741-2.722-0.719-1.382 0.02-2.671 0.813-3.39 2.047-1.464 2.546-0.373 6.3 1.032 8.363 0.699 1.004 1.515 2.128 2.584 2.086 1.045-0.042 1.436-0.67 2.696-0.67 1.249 0 1.619 0.67 2.708 0.645 1.123-0.018 1.829-1.004 2.505-2.018 0.803-1.142 1.127-2.263 1.142-2.32-0.025-0.01-2.177-0.835-2.197-3.326zM15.344 6.805c0.563-0.699 0.946-1.657 0.839-2.623-0.813 0.035-1.832 0.563-2.415 1.251-0.52 0.608-0.984 1.6-0.863 2.532 0.914 0.07 1.851-0.461 2.439-1.16z" fill="currentColor"/>
                    </svg>
                    Sign in with Apple
                  </>
                )}
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                className="w-full flex items-center justify-center gap-2 border-[#240046] text-[#240046] hover:bg-[#240046]/10" 
                onClick={() => handleSocialSignIn("passkey")}
                disabled={isLoading}
              >
                {isLoading ? (
                  'Signing in...'
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="currentColor"/>
                    </svg>
                    Sign in with Passkey
                  </>
                )}
              </Button>
            </TabsContent>
            
            <TabsContent value="wallet">
              <Button 
                type="button" 
                variant="outline" 
                className="w-full flex items-center justify-center gap-2 border-[#240046] text-[#240046] hover:bg-[#240046]/10" 
                onClick={handleExistingWalletConnect}
                disabled={isLoading}
              >
                {isLoading ? (
                  'Connecting...'
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 18V19C21 20.1 20.1 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.9 3.89 3 5 3H19C20.1 3 21 3.9 21 5V6H12C10.89 6 10 6.9 10 8V16C10 17.1 10.89 18 12 18H21ZM12 16H22V8H12V16ZM16 13.5C15.17 13.5 14.5 12.83 14.5 12C14.5 11.17 15.17 10.5 16 10.5C16.83 10.5 17.5 11.17 17.5 12C17.5 12.83 16.83 13.5 16 13.5Z" fill="currentColor"/>
                    </svg>
                    Connect Existing Wallet
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="text-center pt-2">
          <p className="text-xs text-gray-500">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}