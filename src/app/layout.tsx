import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import './globals.css';
import { ThirdwebProviderWrapper } from '@/providers/ThirdwebProvider';
import { Sidebar } from '@/components/Sidebar';
import { SidebarWrapper } from '@/components/SidebarWrapper';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background">
        <ThirdwebProviderWrapper>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SidebarWrapper>
              {children}
            </SidebarWrapper>
            <Toaster />
          </ThemeProvider>
        </ThirdwebProviderWrapper>
      </body>
    </html>
  );
}
