'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base } from 'wagmi/chains';
import React from 'react';

// Create a singleton instance of QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
      config={{
        loginMethods: ['wallet'],
        appearance: {
          theme: 'light',
          accentColor: '#000000',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <OnchainKitProvider
        apiKey={process.env.NEXT_PUBLIC_ONCHAIN_KIT_API_KEY || ''}
        chain={base}
      >
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </OnchainKitProvider>
    </PrivyProvider>
  );
} 