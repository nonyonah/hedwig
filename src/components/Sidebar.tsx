'use client';

import { useState } from 'react';
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from "@/lib/utils";
import {
  Search,
  LayoutDashboard,
  Settings,
  Wallet,
  Landmark,
  Leaf, // Added Leaf icon for Earn section
} from 'lucide-react';
import Link from 'next/link';

type SidebarItemProps = {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  href?: string;
  onClick?: () => void;
};

type SidebarSectionProps = {
  title?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
};

const SidebarItem = ({ icon, label, count, active, href, onClick }: SidebarItemProps) => {
  const content = (
    <div
      className={cn(
        "flex items-center justify-between py-2 px-3 rounded-md text-sm transition-colors",
        active 
          ? "bg-primary/10 text-primary font-medium" 
          : "hover:bg-muted hover:text-foreground dark:text-sidebar-foreground" // Added dark mode text color
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">{count}</span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
};

const SidebarSection = ({ children }: SidebarSectionProps) => {
  // Removed title, collapsible, and defaultOpen props since we're removing categories
  return (
    <div className="mb-4">
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
};

export function Sidebar() {
  const [activePath] = useState('/overview');
  
  return (
    <div className="fixed h-screen w-60 flex flex-col border-r bg-background p-3 overflow-y-auto">
      {/* Sidebar content */}
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
          A
        </div>
        <span className="font-semibold dark:text-sidebar-foreground">Albus</span>
      </div>
      
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search"
          className="h-9 pl-9 bg-muted border-none"
        />
      </div>
      
      <div className="flex-1 overflow-auto space-y-1">
        <SidebarSection>
          <SidebarItem 
            icon={<LayoutDashboard className="h-4 w-4" />} 
            label="Overview" 
            href="/overview"
            active={activePath === '/overview'}
          />
        </SidebarSection>
        
        {/* Changed Wallet to Trade and removed submenu */}
        <SidebarSection>
          <SidebarItem 
            icon={<Wallet className="h-4 w-4" />} 
            label="Trade" 
            href="/trade"
            active={activePath.startsWith('/trade')}
          />
        </SidebarSection>
        
        {/* Changed DeFi to Earn with Leaf icon and removed submenu */}
        <SidebarSection>
          <SidebarItem 
            icon={<Leaf className="h-4 w-4" />} 
            label="Earn" 
            href="/earn"
            active={activePath.startsWith('/earn')}
          />
        </SidebarSection>
        
        <SidebarSection>
          <SidebarItem 
            icon={<Landmark className="h-4 w-4" />} 
            label="Accounts" 
            href="/banking/accounts"
            active={activePath === '/banking/accounts'}
          />
        </SidebarSection>
        
        <SidebarSection>
          <SidebarItem 
            icon={<Settings className="h-4 w-4" />} 
            label="Settings" 
            href="/settings"
            active={activePath === '/settings'}
          />
        </SidebarSection>
      </div>
      
      <div className="mt-auto pt-4 border-t">
        <ThemeToggle />
      </div>
    </div>
  );
}