'use client';

import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base, optimism, arbitrum, mainnet, bsc } from 'viem/chains';
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
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAIN_KIT_API_KEY || ''}
      // Use a single chain as the default
      chain={base}
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </OnchainKitProvider>
  );
}