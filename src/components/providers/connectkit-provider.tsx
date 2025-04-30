'use client';

import { WagmiProvider, createConfig } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider as ConnectKitProviderOriginal, getDefaultConfig } from 'connectkit';
import { mainnet, base, optimism, arbitrum, bsc } from 'viem/chains';
import { useState } from 'react';

// Create a wagmi config with ConnectKit
const config = createConfig(
  getDefaultConfig({
    // Your dApp's info
    appName: 'Albus',
    // Optional app description
    appDescription: 'Keep track of your finances both on and offchain',
    // Optional app icon (URL or Base64 encoded)
    appIcon: 'https://your-logo-url.com/logo.png', // Replace with your actual logo URL
    // Your API keys
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
    // Supported chains - fix the format to match expected type
    chains: [mainnet, base, optimism, arbitrum, bsc],
  }),
);

export function WalletConnectProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProviderOriginal>
          {children}
        </ConnectKitProviderOriginal>
      </QueryClientProvider>
    </WagmiProvider>
  );
}