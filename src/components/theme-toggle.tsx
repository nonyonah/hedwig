'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

export function ThemeToggle({ className }: { className?: string } = {}) {
  const { theme, setTheme } = useTheme();

  // Check if the className contains flex-col to determine if sidebar is collapsed
  const isVertical = className?.includes('flex-col');

  return (
    <div className={cn(
      "flex items-center", 
      isVertical ? "space-y-1" : "space-x-1", 
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