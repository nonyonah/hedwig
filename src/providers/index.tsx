'use client';

import { ThemeProvider } from '@/components/theme-provider';
import { PrivyProvider } from './PrivyProvider';

// Define a type for the session
type SessionType = null | undefined;

export function Providers({
  children, // Keep this parameter for backward compatibility
}: {
  children: React.ReactNode;
  session?: SessionType; // Use a specific type instead of 'any'
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
