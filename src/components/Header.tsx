'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const pathname = usePathname();
  
  return (
    <header className="w-full border-b bg-white py-4 px-6">
      <div className="container mx-auto flex items-center justify-between">
        {/* Main Navigation */}
        <nav className="flex items-center space-x-6">
          <Link href="/" className={`font-medium ${pathname === '/' ? 'text-primary' : 'text-gray-600 hover:text-gray-900'}`}>
            Home
          </Link>
          <Link href="/trade" className={`font-medium ${pathname === '/trade' ? 'text-primary' : 'text-gray-600 hover:text-gray-900'}`}>
            Trade
          </Link>
        </nav>
        
        {/* Right side actions */}
        <div className="flex items-center space-x-4">
          <button className="text-gray-600 hover:text-gray-900">
            <Bell size={20} />
          </button>
          <Button variant="outline" className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50">
            <span className="flex items-center">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Connect Wallet
            </span>
          </Button>
        </div>
      </div>
    </header>
  );
}