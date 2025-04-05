'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center space-x-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme('light')}
        className={theme === 'light' ? 'bg-accent' : ''}
        aria-label="Light mode"
      >
        <Sun className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme('dark')}
        className={theme === 'dark' ? 'bg-accent' : ''}
        aria-label="Dark mode"
      >
        <Moon className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme('system')}
        className={theme === 'system' ? 'bg-accent' : ''}
        aria-label="System preference"
      >
        <Monitor className="h-5 w-5" />
      </Button>
    </div>
  );
}