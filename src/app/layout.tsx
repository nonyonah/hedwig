import { ThemeProvider } from '@/components/theme-provider';
import { WalletConnectProvider } from '@/components/providers/connectkit-provider';
import { Toaster } from 'sonner';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <WalletConnectProvider>
            {children}
            <Toaster position="top-right" />
          </WalletConnectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
