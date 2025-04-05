'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}

export const useTheme = () => {
  const { theme, setTheme } = React.useContext(require('next-themes').ThemeContext) as { theme: string | undefined; setTheme: (theme: string) => void };

  if (theme === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return { theme, setTheme };
};