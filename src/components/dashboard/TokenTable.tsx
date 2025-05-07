import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp } from "lucide-react";
import Image from "next/image";
import { WalletData } from "@/hooks/useWalletConnection";
import { TokenIcon } from "@/components/dashboard/TokenIcon";

interface TokenTableProps {
  walletData: WalletData | null;
  isLoading: boolean;
}

export function TokenTable({ walletData, isLoading }: TokenTableProps) {
  // Chain colors for badges
  const chainColors: Record<string, string> = {
    ethereum: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    polygon: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    binance: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    arbitrum: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    optimism: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    base: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };

  // Chain display names
  const chainNames: Record<string, string> = {
    ethereum: "Ethereum",
    polygon: "Polygon",
    binance: "BNB Chain",
    arbitrum: "Arbitrum",
    optimism: "Optimism",
    base: "Base",
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!walletData || !walletData.tokenBalances || walletData.tokenBalances.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No token data available. Connect your wallet to view your tokens.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Token</TableHead>
          <TableHead>Chain</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">USD Value</TableHead>
          <TableHead className="text-right">Market Share</TableHead>
          <TableHead className="text-right">24h Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {walletData.tokenBalances.map((token, index) => (
          <TableRow key={index}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <TokenIcon 
                  symbol={token.symbol || "UNKNOWN"} 
                  size="md"
                />
                <span>{token.name || "Unknown Token"}</span>
              </div>
            </TableCell>
            <TableCell>
              {token.chain && (
                <Badge variant="outline" className={chainColors[token.chain] || ""}>
                  {chainNames[token.chain] || token.chain}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              ${(token.usdValue && token.balance ? (token.usdValue / token.balance).toFixed(2) : "0.00")}
            </TableCell>
            <TableCell className="text-right">
              ${token.usdValue?.toFixed(2) || "0.00"}
            </TableCell>
            <TableCell className="text-right">
              {token.marketShare?.toFixed(1) || "0.0"}%
            </TableCell>
            <TableCell className="text-right">
              <div className={`flex items-center justify-end ${
                (token.priceChange24h || 0) > 0 
                  ? "text-green-500" 
                  : (token.priceChange24h || 0) < 0 
                    ? "text-red-500" 
                    : ""
              }`}>
                {(token.priceChange24h || 0) > 0 ? (
                  <ArrowUp className="h-4 w-4 mr-1" />
                ) : (token.priceChange24h || 0) < 0 ? (
                  <ArrowDown className="h-4 w-4 mr-1" />
                ) : null}
                {Math.abs(token.priceChange24h || 0).toFixed(2)}%
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}