'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, TrendingUp, TrendingDown } from 'lucide-react';

// Import Badge component if not already imported
import { Badge } from "@/components/ui/badge";

// Define the Token interface
interface Token {
  symbol: string | null;
  name: string | null;
  logo: string | null;
  balance: number;
  usdValue?: number | undefined;
  chain?: string;
  priceChange24h?: number;
}

// Update the TokenTableProps interface to include chainColors
interface TokenTableProps {
  tokens: Token[];
  isLoading: boolean;
  walletConnected: boolean;
  chainColors?: Record<string, string>;
}

// Update your component to use the props interface
export function TokenTable({ tokens, isLoading, walletConnected, chainColors }: TokenTableProps) {
  // Get chain display name
  const getChainName = (chain?: string) => {
    if (!chain) return 'Unknown';
    
    const chainMap = {
      'ethereum': 'Ethereum',
      'optimism': 'Optimism',
      'arbitrum': 'Arbitrum',
      'base': 'Base',
      'polygon': 'Polygon',
    };
    
    return chainMap[chain as keyof typeof chainMap] || chain.charAt(0).toUpperCase() + chain.slice(1);
  };
  
  // Add the missing getChainColor function
  const getChainColor = (chainName: string | undefined): string => {
    if (!chainName || !chainColors) return '#8d99ae'; // Default color
    
    const normalizedChain = chainName.toLowerCase();
    return chainColors[normalizedChain] || '#8d99ae';
  };
  
  // Sort tokens by USD value
  const sortedTokens = [...tokens].sort((a, b) => 
    (b.usdValue || 0) - (a.usdValue || 0)
  );
  
  if (isLoading) {
    return (
      <div className="w-full">
        <div className="flex items-center space-x-4 py-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
        <div className="flex items-center space-x-4 py-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
        <div className="flex items-center space-x-4 py-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
      </div>
    );
  }

  if (!walletConnected) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">Connect your wallet to view your token balances</p>
      </div>
    );
  }
  
  // If no real tokens, show mock data
  if (sortedTokens.length === 0) {
    const mockTokens: Token[] = [
      {
        symbol: 'ETH',
        name: 'Ethereum',
        logo: null,
        balance: 1.25,
        usdValue: 3750,
        chain: 'ethereum',
        priceChange24h: 2.5
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        logo: null,
        balance: 2500,
        usdValue: 2500,
        chain: 'ethereum',
        priceChange24h: 0.1
      },
      {
        symbol: 'BNB',
        name: 'Binance Coin',
        logo: null,
        balance: 5.5,
        usdValue: 1650,
        chain: 'binance',
        priceChange24h: -1.2
      },
      {
        symbol: 'OP',
        name: 'Optimism',
        logo: null,
        balance: 500,
        usdValue: 1000,
        chain: 'optimism',
        priceChange24h: 5.3
      },
      {
        symbol: 'ARB',
        name: 'Arbitrum',
        logo: null,
        balance: 300,
        usdValue: 750,
        chain: 'arbitrum',
        priceChange24h: 3.8
      },
      {
        symbol: 'MATIC',
        name: 'Polygon',
        logo: null,
        balance: 1000,
        usdValue: 500,
        chain: 'polygon',
        priceChange24h: -0.8
      },
      {
        symbol: 'AVAX',
        name: 'Avalanche',
        logo: null,
        balance: 20,
        usdValue: 250,
        chain: 'avalanche',
        priceChange24h: 1.5
      }
    ];
    
    return renderTable(mockTokens);
  }
  
  return renderTable(sortedTokens);
  
  // In your renderTable function, update the chain cell to use badges
  function renderTable(tokensToRender: Token[]) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Token</TableHead>
            <TableHead>Chain</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">24h Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokensToRender.map((token, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {token.logo ? (
                    <img src={token.logo} alt={token.symbol || ''} className="h-6 w-6 rounded-full" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                      {token.symbol?.[0] || '?'}
                    </div>
                  )}
                  <div>
                    <div>{token.symbol}</div>
                    <div className="text-xs text-muted-foreground">{token.name}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {token.chain ? (
                  <Badge 
                    style={{ 
                      backgroundColor: getChainColor(token.chain),
                      color: '#ffffff',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    {getChainName(token.chain)}
                  </Badge>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="text-right">{token.balance.toLocaleString()}</TableCell>
              <TableCell className="text-right">${token.usdValue?.toLocaleString() || '0'}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {token.priceChange24h !== undefined ? (
                    <>
                      {token.priceChange24h > 0 ? (
                        <>
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-green-500">{token.priceChange24h}%</span>
                        </>
                      ) : token.priceChange24h < 0 ? (
                        <>
                          <TrendingDown className="h-4 w-4 text-red-500" />
                          <span className="text-red-500">{Math.abs(token.priceChange24h)}%</span>
                        </>
                      ) : (
                        <span>0%</span>
                      )}
                    </>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
}
