'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';

export function HeaderWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith('/auth');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {!isAuthPage && <Header />}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}