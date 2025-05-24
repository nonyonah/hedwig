'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { User } from '@supabase/supabase-js';
import { getSession, signOut, signInWithOAuth } from '@/lib/supabase';
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: session } = await getSession();
        setUser(session?.user || null);
      } catch (error) {
        console.error('Error loading user:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadUser();
  }, []);

  const handleSignIn = async () => {
    await signInWithOAuth('google');
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <Button variant="outline" className="bg-white border-[#414651] text-gray-700 hover:bg-gray-50 dark:bg-[#454545] dark:text-white dark:border-gray-700 dark:hover:bg-opacity-90" disabled>
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

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center gap-2 cursor-pointer">
            <Avatar className="h-8 w-8 border border-gray-200">
              <AvatarImage src={user.user_metadata?.avatar_url} alt={user.user_metadata?.full_name || 'User'} />
              <AvatarFallback>{user.email?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <ChevronDown className="h-4 w-4 text-gray-600" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-[#222222] border-gray-200 dark:border-gray-700">
          <DropdownMenuLabel className="text-gray-700 dark:text-gray-300">
            {user.user_metadata?.full_name || user.email}
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
    <Button variant="outline" className="bg-white border-[#414651] text-gray-700 hover:bg-gray-50 dark:bg-[#454545] dark:text-white dark:border-gray-700 dark:hover:bg-opacity-90" onClick={handleSignIn}>
      <span className="flex items-center">
        <UserIcon className="mr-2 h-4 w-4" />
        Sign In
      </span>
    </Button>
  );
}