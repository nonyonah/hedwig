'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar, SidebarContent, SidebarGroup } from '@/components/ui/sidebar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { usePrivy } from '@privy-io/react-auth';
import { formatAddress } from '@/lib/utils';
import { 
  LayoutDashboard, 
  WalletCards, 
  Clock4,
  Gem,
  Settings,
  HelpCircle,
  PanelLeftIcon,
  PanelRightIcon
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Add CSS for main content transition
const sidebarStyles = `
  /* Add styles to adjust main content when sidebar collapses */
  /* Removed global main margin/width styles to fix layout gap */
`;

interface SidebarNavProps extends React.HTMLAttributes<HTMLDivElement> {}

// Component to inject styles into the document head
function InjectStyles() {
  useEffect(() => {
    // Create style element
    const styleElement = document.createElement('style');
    styleElement.innerHTML = sidebarStyles;
    document.head.appendChild(styleElement);

    // Cleanup on unmount
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  return null;
}

export function SidebarNav({ className, ...props }: SidebarNavProps) {

  const pathname = usePathname();
  const { user } = usePrivy();
  // Remove collapsed state and related effects

  const routes = [
    {
      label: 'Overview',
      icon: LayoutDashboard,
      href: '/overview',
    },
    {
      label: 'Accounts',
      icon: WalletCards,
      href: '/accounts',
    },
    {
      label: 'Transactions',
      icon: Clock4,
      href: '/transactions',
    },
    {
      label: 'NFTs',
      icon: Gem,
      href: '/nfts',
    },
  ];

  const bottomRoutes = [
    {
      label: 'Settings',
      icon: Settings,
      href: '/settings',
    },
    {
      label: 'Support',
      icon: HelpCircle,
      href: '/support',
    },
  ];

  return (
    <>
      <InjectStyles />
      <Sidebar 
        className={cn(
          'h-screen flex flex-col transition-all duration-300 ease-in-out border-r overflow-y-auto overflow-x-hidden w-[16rem] bg-white', // Added bg-white
          className
        )} 
        {...props}
      >
      <SidebarContent className="px-2 overflow-hidden">
        <SidebarGroup>
          <div className="flex items-center h-14 px-3 justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Albus</h2>
          </div>
          <div className="space-y-1 px-2 mt-2">
            {routes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }), // Default to ghost
                    'w-full justify-start',
                    pathname === route.href && 'bg-[#7F56D9] text-white hover:bg-[#7F56D9]/90' // Active state styles
                  )}
                >
                  <route.icon className={cn("h-4 w-4 mr-2", pathname === route.href && "text-white")} />
                  {route.label}
                </Link>
            ))}
          </div>
        </SidebarGroup>
        
        <Separator className="my-4 mx-3" />
        
        <SidebarGroup>
          <div className="space-y-1 px-3">
            {bottomRoutes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'w-full justify-start'
                  )}
                >
                  <route.icon className="h-4 w-4 mr-2" />
                  {route.label}
                </Link>
            ))}
          </div>
        </SidebarGroup>
      </SidebarContent>
      
      <div className="mt-auto px-3 py-4 sticky bottom-0">
        <Separator className="mb-4" />
        <div className="flex items-center mb-4 justify-between px-2">
          <h3 className="text-sm font-medium">Theme</h3>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/20">  
          <Avatar>
            <AvatarImage src={undefined} />
            <AvatarFallback>
              {user?.id ? user.id.slice(0, 2).toUpperCase() : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">
              {user?.email?.toString() || formatAddress(user?.wallet?.address || '')}
            </p>
          </div>
        </div>
      </div>
    </Sidebar>
    </>
  );
}