'use client';

import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import ConnectWalletButton from './ConnectWalletButton';
import { toast } from 'sonner';

export default function AuthenticatedConnectButton() {
  const router = useRouter();
  const { isAuthenticated } = useUser();

  const handleClick = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      // Prevent the default ConnectWalletButton click behavior
      e.preventDefault();
      e.stopPropagation();
      
      // Show error message
      toast.error("Please sign in first to connect your wallet");
      
      // Redirect to sign in page
      router.push('/auth/signin');
      return false;
    }
    // If authenticated, allow normal button behavior
    return true;
  };

  return (
    <div onClick={handleClick}>
      <ConnectWalletButton />
    </div>
  );
}