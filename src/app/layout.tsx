import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import './globals.css';
import { ThirdwebProviderWrapper } from '@/providers/ThirdwebProvider';
import { Sidebar } from '@/components/Sidebar';

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
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 ml-60"> {/* Match the width of your sidebar (w-60) */}
                <main className="p-4">
                  {children}
                </main>
              </div>
            </div>
            <Toaster />
          </ThemeProvider>
        </ThirdwebProviderWrapper>
      </body>
    </html>
  );
}
