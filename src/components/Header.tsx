'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { PrivyWalletButton } from '@/components/PrivyWalletButton';

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
          <PrivyWalletButton />
        </div>
      </div>
    </header>
  );
}