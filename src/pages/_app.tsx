import '@/styles/globals.css';
import '@rainbow-me/rainbowkit/styles.css';
import '@coinbase/onchainkit/styles.css';
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { baseSepolia } from 'wagmi/chains';
import { config } from '../lib/wagmi';
import { Toaster } from 'sonner';

const queryClient = new QueryClient();

export default function App({ Component, pageProps }: AppProps) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || process.env.ONCHAINKIT_API_KEY || '';
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={apiKey}
          chain={baseSepolia}
          config={{
            appearance: {
              name: 'Hedwig',
              logo: '/favicon.ico',
              mode: 'light',
              theme: 'default',
            },
            wallet: {
              display: 'modal',
              termsUrl: 'https://example.com/terms',
              privacyUrl: 'https://example.com/privacy',
            },
          }}
        >
          <RainbowKitProvider>
            <Component {...pageProps} />
            <Toaster position="top-right" />
          </RainbowKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
