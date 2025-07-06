'use client';

import '../lib/polyfills';
import { ThemeProvider } from '../components/theme-provider';

// Define a type for the session
type SessionType = null | undefined;

export function Providers({
  children,
}: {
  children: React.ReactNode;
  session?: SessionType;
}) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
