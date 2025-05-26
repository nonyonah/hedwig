'use client';

import { PrivyProvider as PrivyWagmiProvider, useLogin } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyWagmiProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'YOUR_PRIVY_APP_ID'}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#0F172A',
          logo: '/logo.png',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        loginMethods: ['email', 'google', 'wallet'],
      }}
    >
      <PrivyAuthHandler />
      {children}
    </PrivyWagmiProvider>
  );
}

// Create a separate component to handle authentication callbacks
function PrivyAuthHandler() {
  const router = useRouter();
  
  // Use the useLogin hook to register callbacks
  useLogin({
    onComplete: ({ user, isNewUser }) => {
      console.log('Privy onSuccess callback, user:', user);
      
      // This replaces the previous onLoginSuccess callback
      if (!isNewUser) {
        router.push('/overview');
      } else {
        router.push('/onboarding');
      }
    },
    onError: (error) => {
      console.error('Privy login error:', error);
    }
  });
  
  return null; // This component doesn't render anything
}