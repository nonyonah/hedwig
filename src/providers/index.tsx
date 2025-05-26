'use client';

import { ThemeProvider } from '@/components/theme-provider';
import { PrivyProvider } from './PrivyProvider';

export function Providers({
  children, // Keep this parameter
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </PrivyProvider>
  );
}
