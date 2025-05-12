'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from "@/lib/utils";
import {
  Search,
  LayoutDashboard,
  Clock,
  ShoppingCart,
  List,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  CreditCard,
  Wallet
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
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
            "flex items-center px-3 py-2 text-xs font-medium text-muted-foreground",
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
  const [activePath, setActivePath] = useState('/overview');
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  
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
          
          {/* Transactions with collapsible submenu */}
          <div>
            <div
              className={cn(
                "flex items-center justify-between py-2 px-3 rounded-md text-sm transition-colors cursor-pointer",
                (activePath.startsWith('/transactions') || transactionsOpen) 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => setTransactionsOpen(!transactionsOpen)}
            >
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4" />
                <span>Transactions</span>
              </div>
              {transactionsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
            
            {transactionsOpen && (
              <div className="ml-6 space-y-1 mt-1">
                <SidebarItem 
                  icon={<Clock className="h-4 w-4" />} 
                  label="History" 
                  href="/transactions/history"
                  active={activePath === '/transactions/history'}
                />
                <SidebarItem 
                  icon={<CreditCard className="h-4 w-4" />} 
                  label="Buy" 
                  href="/transactions/buy"
                  active={activePath === '/transactions/buy'}
                />
                <SidebarItem 
                  icon={<Wallet className="h-4 w-4" />} 
                  label="Sell" 
                  href="/transactions/sell"
                  active={activePath === '/transactions/sell'}
                />
                <SidebarItem 
                  icon={<ArrowUpDown className="h-4 w-4" />} 
                  label="Swap Crypto" 
                  href="/transactions/swap"
                  active={activePath === '/transactions/swap'}
                />
              </div>
            )}
          </div>
          
          <SidebarItem 
            icon={<ShoppingCart className="h-4 w-4" />} 
            label="Collectibles" 
            href="/collectibles"
            active={activePath === '/collectibles'}
          />
          <SidebarItem 
            icon={<List className="h-4 w-4" />} 
            label="Watchlist" 
            href="/watchlist"
            active={activePath === '/watchlist'}
          />
          <SidebarItem 
            icon={<Settings className="h-4 w-4" />} 
            label="Settings" 
            href="/settings"
            active={activePath === '/settings'}
          />
        </SidebarSection>
      </div>
      
      <div className="mt-auto border-t pt-3">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}