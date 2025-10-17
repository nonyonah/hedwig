'use client';

import '../lib/polyfills';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '../lib/appkit';
import { useState } from 'react';
import { WalletProviderWrapper } from './WalletProvider';

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletProviderWrapper>
          {children}
        </WalletProviderWrapper>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
