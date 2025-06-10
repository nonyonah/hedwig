'use client';

import * as React from 'react';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: string;
  attribute?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

export function ThemeProvider({ 
  children, 
  defaultTheme = 'light',
  ...props 
}: ThemeProviderProps) {
  // Simply render children without any theming logic
  return <>{children}</>;
}

// Create a simple useTheme hook that returns a default theme
export function useTheme() {
  return {
    theme: 'light',
    setTheme: (theme: string) => {},
    themes: ['light'],
  };
}

// Export themes for use elsewhere
export const themes = {
  light: {
    primary: '#344e41',
  },
  dark: {
    primary: '#344e41',
  },
};