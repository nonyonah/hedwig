'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePrivy } from '@privy-io/react-auth';
import { formatAddress } from '@/lib/utils';
import { 
  LayoutDashboard, 
  WalletCards, 
  Clock4,
  Gem,
  Settings,
  HelpCircle
} from 'lucide-react';

interface SidebarNavProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SidebarNav({ className, ...props }: SidebarNavProps) {
  const pathname = usePathname();
  const { user } = usePrivy();

  const routes = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      href: '/dashboard',
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
    <Sidebar className={cn('pb-12', className)} {...props}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-lg font-semibold">General</h2>
          <div className="space-y-1">
            {routes.map((route) => (
              <Button
                key={route.href}
                variant={pathname === route.href ? 'default' : 'ghost'}
                className="w-full justify-start"
                asChild
              >
                <Link href={route.href}>
                  <route.icon className="mr-2 h-4 w-4" />
                  {route.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="px-3 py-2">
          <div className="space-y-1">
            {bottomRoutes.map((route) => (
              <Button
                key={route.href}
                variant="ghost"
                className="w-full justify-start"
                asChild
              >
                <Link href={route.href}>
                  <route.icon className="mr-2 h-4 w-4" />
                  {route.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-auto px-3 py-2">
        <div className="flex items-center gap-2 p-2">
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
  );
} 