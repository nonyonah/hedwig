import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import './globals.css';
import { HeaderWrapper } from '@/components/HeaderWrapper';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <HeaderWrapper>
            {children}
          </HeaderWrapper>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
