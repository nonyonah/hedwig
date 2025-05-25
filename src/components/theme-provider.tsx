'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light" // Explicitly light
      enableSystem={false} // System preference is disabled
      storageKey="vite-ui-theme" // A common storage key, ensures consistency
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

// Export useTheme directly from next-themes instead of creating a custom hook
export { useTheme } from 'next-themes';

// Export themes for use elsewhere
export const themes = {
  light: {
    primary: '#344e41',
  },
  dark: {
    primary: '#344e41',
  },
};