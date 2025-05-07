import React from 'react';

export interface TokenIconProps {
  symbol: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function TokenIcon({ symbol, size = 'md' }: TokenIconProps) {
  const sizeClass = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }[size];
  
  const symbolText = symbol?.slice(0, 2) || '??';
  
  return (
    <div className={`${sizeClass} rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary`}>
      {symbolText}
    </div>
  );
}