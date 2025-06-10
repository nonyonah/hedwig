'use client';

import * as React from 'react';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ 
  children,
}: ThemeProviderProps) {
  // Simply render children without any theming logic
  return <>{children}</>;
}

// Create a simple useTheme hook that returns a default theme
export function useTheme() {
  const [theme, setTheme] = React.useState('light');
  
  return {
    theme,
    setTheme,
    themes: ['light', 'dark'],
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