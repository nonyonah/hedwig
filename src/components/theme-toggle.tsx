'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Simple theme context
const ThemeContext = React.createContext({
  theme: 'light',
  setTheme: (theme: string) => {},
  themes: ['light'],
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function ThemeToggle({ className }: { className?: string } = {}) {
  // Use a simple state for theme
  const [theme, setTheme] = React.useState('light');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className={cn(className)}
      >
        <Sun className="h-4 w-4" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  // Simplified theme toggle that just toggles between light and dark
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <div className={cn(
      "flex items-center", 
      className?.includes('flex-col') ? "space-y-1" : "space-x-1", 
      className
    )}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme('light')}
        className={cn("h-8 w-8", theme === 'light' ? 'bg-accent' : '')}
        aria-label="Light mode"
      >
        <Sun className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme('dark')}
        className={cn("h-8 w-8", theme === 'dark' ? 'bg-accent' : '')}
        aria-label="Dark mode"
      >
        <Moon className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme('system')}
        className={cn("h-8 w-8", theme === 'system' ? 'bg-accent' : '')}
        aria-label="System preference"
      >
        <Monitor className="h-4 w-4" />
      </Button>
    </div>
  );
}