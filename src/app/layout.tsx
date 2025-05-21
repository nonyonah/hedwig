import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Import Inter font
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider'; // Assuming this path is correct
import { PrivyProvider } from '@/providers/PrivyProvider'; // Assuming this path is correct

// Initialize Inter font with desired subsets
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Your App Name',
  description: 'Your app description',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}> {/* Apply Inter font class to body */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <PrivyProvider>
            {children}
          </PrivyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
