'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes';
import { ThemeContext } from 'next-themes'; // Add this import at the top

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      value={{
        light: 'light'
      }}
      forcedTheme="light"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export const useTheme = () => {
  // Replace require() with proper import (already added at the top)
  const { theme, setTheme } = React.useContext(ThemeContext) as {
    theme: string | undefined;
    setTheme: (theme: string) => void;
  };

  if (theme === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return { theme, setTheme };
};

// Either remove the unused themes variable or export it if you plan to use it later
// Option 1: Remove it completely
// const themes = {
//   light: {
//     primary: '#240046',
//   },
//   dark: {
//     primary: '#240046',
//   },
// }

// Option 2: Export it for use elsewhere
export const themes = {
  light: {
    primary: '#240046',
  },
  dark: {
    primary: '#240046',
  },
};