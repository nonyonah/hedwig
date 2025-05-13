'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';

export function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith('/auth');

  return (
    <div className="flex min-h-screen">
      {!isAuthPage && <Sidebar />}
      <div className={!isAuthPage ? "flex-1 ml-60" : "flex-1"}>
        <main className="p-4">
          {children}
        </main>
      </div>
    </div>
  );
}