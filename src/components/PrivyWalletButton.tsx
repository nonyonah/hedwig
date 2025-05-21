'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';

export function PrivyWalletButton() {
  const { login, logout, authenticated, user, ready } = usePrivy();

  if (!ready) {
    return (
      <Button variant="outline" className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50" disabled>
        <span className="flex items-center">
          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      </Button>
    );
  }

  if (authenticated) {
    return (
      <Button variant="outline" className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50" onClick={logout}>
        <span className="flex items-center">
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 12L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 8L16 12L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : 'Disconnect'}
        </span>
      </Button>
    );
  }

  return (
    <Button variant="outline" className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50" onClick={login}>
      <span className="flex items-center">
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 8V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Connect Wallet
      </span>
    </Button>
  );
}