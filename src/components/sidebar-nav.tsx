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
  body.sidebar-collapsed main {
    margin-left: 4.5rem;
    width: calc(100% - 4.5rem);
    transition: margin-left 0.3s ease-in-out, width 0.3s ease-in-out;
  }
  
  body:not(.sidebar-collapsed) main {
    margin-left: 16rem;
    width: calc(100% - 16rem);
    transition: margin-left 0.3s ease-in-out, width 0.3s ease-in-out;
  }
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
  // Initialize state first before any references to it
  const [collapsed, setCollapsed] = useState(false);
  
  // Load collapsed state from localStorage on component mount
  // This needs to be the first useEffect to ensure state is properly initialized
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('sidebar-collapsed');
      if (savedState !== null) {
        setCollapsed(savedState === 'true');
      }
    }
  }, []);
  
  // Add a custom class to the body element when the sidebar is collapsed
  // This will be used to adjust the main content area
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('sidebar-collapsed', collapsed);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('sidebar-collapsed');
      }
    };
  }, [collapsed]);
  
  // Save collapsed state to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', String(collapsed));
    }
  }, [collapsed]);

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
          'h-screen flex flex-col transition-all duration-300 ease-in-out border-r overflow-y-auto overflow-x-hidden', 
          collapsed ? 'w-[4.5rem]' : 'w-[16rem]', 
          className
        )} 
        {...props}
      >
      <SidebarContent className="px-2 overflow-hidden">
        <SidebarGroup>
          <div className={cn(
            "flex items-center h-14 px-3", 
            collapsed ? "justify-center" : "justify-between"
          )}>
            {!collapsed && <h2 className="text-lg font-semibold tracking-tight">Albus</h2>}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8" 
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelRightIcon className="h-4 w-4" /> : <PanelLeftIcon className="h-4 w-4" />}
            </Button>
          </div>
          <div className="space-y-1 px-2 mt-2">
            {routes.map((route) => (
              collapsed ? (
                <TooltipProvider key={route.href}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={route.href}
                        className={cn(
                          buttonVariants({ variant: pathname === route.href ? 'secondary' : 'ghost', size: 'sm' }),
                          'w-full justify-center px-2'
                        )}
                      >
                        <route.icon className="h-4 w-4 mr-0" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {route.label}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Link
                  key={route.href}
                  href={route.href}
                  className={cn(
                    buttonVariants({ variant: pathname === route.href ? 'secondary' : 'ghost', size: 'sm' }),
                    'w-full justify-start'
                  )}
                >
                  <route.icon className="h-4 w-4 mr-2" />
                  {route.label}
                </Link>
              )
            ))}
          </div>
        </SidebarGroup>
        
        <Separator className="my-4 mx-3" />
        
        <SidebarGroup>
          <div className="space-y-1 px-3">
            {bottomRoutes.map((route) => (
              collapsed ? (
                <TooltipProvider key={route.href}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={route.href}
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'sm' }),
                          'w-full justify-center px-2'
                        )}
                      >
                        <route.icon className="h-4 w-4 mr-0" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {route.label}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
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
              )
            ))}
          </div>
        </SidebarGroup>
      </SidebarContent>
      
      <div className="mt-auto px-3 py-4 sticky bottom-0">
        <Separator className="mb-4" />
        <div className={cn(
          "flex items-center mb-4", 
          collapsed ? "justify-center" : "justify-between px-2"
        )}>
          {!collapsed && <h3 className="text-sm font-medium">Theme</h3>}
          {collapsed ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <ThemeToggle className="flex-col space-y-1 space-x-0" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Theme Settings
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <ThemeToggle />
          )}
        </div>
        <div className={cn("flex items-center gap-2 p-2 rounded-md bg-secondary/20", collapsed && "justify-center")}>  
          <Avatar>
            <AvatarImage src={undefined} />
            <AvatarFallback>
              {user?.id ? user.id.slice(0, 2).toUpperCase() : '?'}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">
                {user?.email?.toString() || formatAddress(user?.wallet?.address || '')}
              </p>
            </div>
          )}
        </div>
      </div>
    </Sidebar>
    </>
  );
}