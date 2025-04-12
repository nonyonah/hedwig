import { Metadata } from "next";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarProvider } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: "Dashboard | Albus Finance",
  description: "Your financial dashboard",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 border-r bg-background md:block">
        <div className="flex h-full flex-col">
          <SidebarProvider>
            <SidebarNav />
          </SidebarProvider>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}