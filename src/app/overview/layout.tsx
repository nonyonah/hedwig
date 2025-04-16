'use client';

import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarProvider } from "@/components/ui/sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden">
        <SidebarNav />
        <main className="flex-1 overflow-y-auto py-6">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}