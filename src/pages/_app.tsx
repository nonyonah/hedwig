import '@/styles/globals.css';
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { Toaster } from 'sonner';
import { wagmiConfig } from '../lib/appkit';

const queryClient = new QueryClient();

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
        <Toaster position="top-right" />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
