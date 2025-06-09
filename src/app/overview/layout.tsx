'use client';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}