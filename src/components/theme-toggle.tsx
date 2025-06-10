'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTheme } from './theme-provider';

export function ThemeToggle({ className }: { className?: string } = {}) {
  const { theme, setTheme } = useTheme();
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

  return (
    <div className={cn(
      "flex items-center", 
      className?.includes('flex-col') ? "space-y-1" : "space-x-1", 
      className
    )}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setTheme('light');
          document.documentElement.classList.remove('dark');
        }}
        className={cn("h-8 w-8", theme === 'light' ? 'bg-accent' : '')}
        aria-label="Light mode"
      >
        <Sun className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setTheme('dark');
          document.documentElement.classList.add('dark');
        }}
        className={cn("h-8 w-8", theme === 'dark' ? 'bg-accent' : '')}
        aria-label="Dark mode"
      >
        <Moon className="h-4 w-4" />
      </Button>
    </div>
  );
}