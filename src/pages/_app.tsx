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
        // Customize Privy's appearance here
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
          logo: 'https://your-logo-url.com/logo.png', // Replace with your logo URL
        },
        // Customize Privy's login methods here
        loginMethods: ['email'],
        // Enable session signers for KeyQuorum authorization
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false,
        },
        // Session signers are configured through Privy Dashboard and managed via API
        // KeyQuorum authorization is handled server-side through the Privy API
      }}
    >
      <Component {...pageProps} />
    </PrivyProvider>
  );
}

export default MyApp;
