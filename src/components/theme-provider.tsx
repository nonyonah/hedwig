'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes';

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

// Export useTheme directly from next-themes instead of creating a custom hook
export { useTheme } from 'next-themes';

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