'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth'; // Import usePrivy
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, Sun, Moon, Laptop, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UserAvatar() {
  const [loading, setLoading] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  // Use Privy's hook for authentication state and user data
  const { user, authenticated, logout } = usePrivy();

  const handleSignIn = () => {
    // Redirect to Privy's login flow or your app's login page
    // This might involve calling a Privy function like `login` or `connectWallet`
    // For now, let's assume your /login page handles Privy login initiation
    router.push('/login'); 
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await logout(); // Use Privy's logout function
      router.push('/login'); // Redirect to login page after logout
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Button variant="outline" className="bg-white border-[#414651] text-gray-700 hover:bg-gray-50" disabled>
        <span className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-900 mr-2"></div>
          Loading...
        </span>
      </Button>
    );
  }

  // Check if the user is authenticated and user object exists
  if (authenticated && user) {
    // Privy user object might have different fields for avatar and email
    // Adjust these based on the actual structure of Privy's user object
    // Common fields might be user.email?.address, user.wallet?.address, or user.linked_accounts for details
    // For avatar, Privy might not directly provide one, or it might be in user.pfp (profile picture)
    const userEmail = user.email?.address || (user.wallet ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : 'User');
    const avatarUrl = undefined; // Replace with actual avatar URL from Privy user object if available e.g. user.pfp
    const fallbackInitial = userEmail.charAt(0).toUpperCase() || 'U';

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center gap-2 cursor-pointer">
            <Avatar className="h-8 w-8 border border-gray-200">
              <AvatarImage src={avatarUrl} alt={userEmail} />
              <AvatarFallback>{fallbackInitial}</AvatarFallback>
            </Avatar>
            <ChevronDown className="h-4 w-4 text-gray-600" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-[#222222] border-gray-200 dark:border-gray-700">
          <DropdownMenuLabel className="text-gray-700 dark:text-gray-300">
            {userEmail}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700"/>
          <DropdownMenuItem 
            onClick={handleSignOut} 
            className="cursor-pointer text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-700/20"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700"/>
          <DropdownMenuLabel className="text-gray-700 dark:text-gray-300">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light" className="cursor-pointer text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Sun className="mr-2 h-4 w-4" />
              <span>Light</span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" className="cursor-pointer text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Moon className="mr-2 h-4 w-4" />
              <span>Dark</span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system" className="cursor-pointer text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Laptop className="mr-2 h-4 w-4" />
              <span>System</span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button variant="outline" className="bg-white border-[#414651] text-gray-700 hover:bg-gray-50" onClick={handleSignIn}>
      <span className="flex items-center">
        <UserIcon className="mr-2 h-4 w-4" />
        Sign In
      </span>
    </Button>
  );
}