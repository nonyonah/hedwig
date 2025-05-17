'use client';

import { useState } from 'react';
// Remove Button import since it's not used
// import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from "@/lib/utils";
import {
  Search,
  LayoutDashboard,
  Settings,
  ChevronDown,
  ChevronRight,
  Wallet,
  // Remove LineChart import since it's not used
  // LineChart,
  Landmark,
  BarChart3,
  // Remove Layers import since it's not used
  // Layers
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
          : "text-black hover:bg-muted hover:text-foreground"
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

const SidebarSection = ({ title, children, collapsible = false, defaultOpen = true }: SidebarSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      {title && (
        <div 
          className={cn(
            "flex items-center px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground",
            collapsible && "cursor-pointer"
          )}
          onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
        >
          {collapsible && (
            isOpen ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />
          )}
          {title}
        </div>
      )}
      {(!collapsible || isOpen) && (
        <div className="space-y-1">
          {children}
        </div>
      )}
    </div>
  );
};

export function Sidebar() {
  // Either use setActivePath or mark it with underscore to indicate it's intentionally unused
  const [activePath] = useState('/overview');
  const [walletOpen, setWalletOpen] = useState(false);
  const [defiOpen, setDefiOpen] = useState(false);
  
  return (
    <div className="fixed h-screen w-60 flex flex-col border-r bg-background p-3 overflow-y-auto">
      {/* Sidebar content */}
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
          A
        </div>
        <span className="font-semibold">Albus</span>
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
        
        {/* Wallet section with collapsible submenu */}
        <SidebarSection title="Wallet">
          <div>
            <div
              className={cn(
                "flex items-center justify-between py-2 px-3 rounded-md text-sm transition-colors cursor-pointer",
                (activePath.startsWith('/wallet') || walletOpen) 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => setWalletOpen(!walletOpen)}
            >
              <div className="flex items-center gap-3">
                <Wallet className="h-4 w-4" />
                <span>Wallet</span>
              </div>
              {walletOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
            
            {walletOpen && (
              <div className="ml-6 space-y-1 mt-1">
                <SidebarItem 
                  icon={<div className="w-1 h-1 rounded-full bg-current" />} 
                  label="Send" 
                  href="/wallet/send"
                  active={activePath === '/wallet/send'}
                />
                <SidebarItem 
                  icon={<div className="w-1 h-1 rounded-full bg-current" />} 
                  label="Receive" 
                  href="/wallet/receive"
                  active={activePath === '/wallet/receive'}
                />
                <SidebarItem 
                  icon={<div className="w-1 h-1 rounded-full bg-current" />} 
                  label="Buy" 
                  href="/wallet/buy"
                  active={activePath === '/wallet/buy'}
                />
              </div>
            )}
          </div>
        </SidebarSection>
        
        {/* DeFi section with collapsible submenu */}
        <SidebarSection title="DeFi">
          <div>
            <div
              className={cn(
                "flex items-center justify-between py-2 px-3 rounded-md text-sm transition-colors cursor-pointer",
                (activePath.startsWith('/defi') || defiOpen) 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => setDefiOpen(!defiOpen)}
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="h-4 w-4" />
                <span>DeFi</span>
              </div>
              {defiOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
            
            {defiOpen && (
              <div className="ml-6 space-y-1 mt-1">
                <SidebarItem 
                  icon={<div className="w-1 h-1 rounded-full bg-current" />} 
                  label="Yield Aggregation" 
                  href="/defi/yield"
                  active={activePath === '/defi/yield'}
                />
              </div>
            )}
          </div>
        </SidebarSection>
        
        <SidebarSection title="Banking">
          <SidebarItem 
            icon={<Landmark className="h-4 w-4" />} 
            label="Accounts" 
            href="/banking/accounts"
            active={activePath === '/banking/accounts'}
          />
        </SidebarSection>
        
        <SidebarSection title="Other">
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