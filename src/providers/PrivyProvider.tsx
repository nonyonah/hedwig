'use client';

import { PrivyProvider as PrivyWagmiProvider } from '@privy-io/react-auth';

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyWagmiProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'YOUR_PRIVY_APP_ID'} // Replace with your Privy App ID
      config={{
        // Customize Privy's appearance here
        appearance: {
          theme: 'light', // or 'dark'
          accentColor: '#676FFF', // Customize your accent color
          logo: 'YOUR_LOGO_URL', // Optional: Add your app's logo URL
        },
        // Configure embedded wallets
        embeddedWallets: {
          createOnLogin: 'users-without-wallets', // or 'all-users'
        },
      }}
    >
      {children}
    </PrivyWagmiProvider>
  );
}