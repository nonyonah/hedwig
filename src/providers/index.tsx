'use client';

import '../lib/polyfills';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '../lib/wagmi';
import { useState } from 'react';
import { WalletProviderWrapper } from './WalletProvider';

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletProviderWrapper>
            {children}
          </WalletProviderWrapper>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
