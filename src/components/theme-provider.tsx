import React from 'react';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Simple passthrough, can be extended for dark/light mode
  return <>{children}</>;
}
