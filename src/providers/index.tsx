'use client';

import { ThemeProvider } from '@/components/theme-provider';

// Define a type for the session
type SessionType = null | undefined;

export function Providers({
  children,
}: {
  children: React.ReactNode;
  session?: SessionType;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
