// src/pages/_app.tsx
import type { AppProps } from 'next/app';
import { PrivyProvider } from '@privy-io/react-auth';
import '@/styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!privyAppId) {
    throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set in .env.local');
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
          logo: 'https://your-logo-url.com/logo.png',
        },
        // Only allow phone number login for strict identity sync
        loginMethods: ['sms'],
      }}
    >
      <Component {...pageProps} />
    </PrivyProvider>
  );
}

export default MyApp;
