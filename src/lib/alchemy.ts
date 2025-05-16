import { Network, Alchemy } from 'alchemy-sdk';

// Define supported chains with their Alchemy network equivalents
export const supportedChains = [
  { key: 'ethereum', name: 'Ethereum', id: 1, network: Network.ETH_MAINNET },
  { key: 'optimism', name: 'Optimism', id: 10, network: Network.OPT_MAINNET },
  { key: 'arbitrum', name: 'Arbitrum', id: 42161, network: Network.ARB_MAINNET },
  { key: 'base', name: 'Base', id: 8453, network: Network.BASE_MAINNET },
  { key: 'polygon', name: 'Polygon', id: 137, network: Network.MATIC_MAINNET },
];

// Initialize Alchemy SDK for different networks
const createAlchemyInstance = (network: Network) => {
  const settings = {
    apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    network,
  };
  
  return new Alchemy(settings);
};

// Get token balances for a wallet across multiple chains
export async function getTokenBalances(address: string) {
  try {
    const results = await Promise.allSettled(
      supportedChains.map(async (chain) => {
        const alchemy = createAlchemyInstance(chain.network);
        const balances = await alchemy.core.getTokenBalances(address);
        
        // Get token metadata for each token
        const tokenDataPromises = balances.tokenBalances.map(async (token) => {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
          return {
            contractAddress: token.contractAddress,
            tokenBalance: token.tokenBalance,
            metadata,
            chain: chain.key,
          };
        });
        
        const tokenData = await Promise.all(tokenDataPromises);
        
        // Get native token balance
        const nativeBalance = await alchemy.core.getBalance(address);
        const nativeBalanceInEth = parseFloat(nativeBalance.toString()) / 1e18;
        
        return {
          chain: chain.key,
          chainId: chain.id,
          nativeBalance: {
            value: nativeBalanceInEth,
            symbol: chain.key === 'ethereum' ? 'ETH' : 
                   chain.key === 'optimism' ? 'ETH' :
                   chain.key === 'arbitrum' ? 'ETH' :
                   chain.key === 'base' ? 'ETH' :
                   chain.key === 'polygon' ? 'MATIC' : 'ETH',
          },
          tokens: tokenData,
        };
      })
    );
    
    // Filter successful results
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map((result) => result.value);
    
    return successfulResults;
  } catch (error) {
    console.error('Error fetching token balances:', error);
    throw error;
  }
}

// Get NFTs for a wallet
export async function getNFTs(address: string) {
  try {
    const results = await Promise.allSettled(
      supportedChains.map(async (chain) => {
        const alchemy = createAlchemyInstance(chain.network);
        const nfts = await alchemy.nft.getNftsForOwner(address);
        
        return {
          chain: chain.key,
          chainId: chain.id,
          nfts: nfts.ownedNfts,
          totalCount: nfts.totalCount,
        };
      })
    );
    
    // Filter successful results
    // Define an interface for NFT data
    interface NFTData {
      chain: string;
      chainId: number;
      nfts: unknown[];
      totalCount: number;
    }
    
    // Replace this line:
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map((result) => result.value);
    
    // With this (using the ChainData interface):
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<ChainData> => result.status === 'fulfilled')
      .map((result) => result.value);
    
    return successfulResults;
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    throw error;
  }
}

// Get token prices
// Define the TokenData interface
interface TokenData {
  contractAddress: string;
  tokenBalance: string;
  
  // With this (using the TokenMetadataResponse interface):
  metadata: TokenMetadataResponse;
  chain?: string;
}

// Define the ChainData interface
interface ChainData {
  chain: string;
  chainId: number;
  nativeBalance: {
    value: number;
    symbol: string;
  };
  tokens: TokenData[];
}

// Define the FormattedToken interface
interface FormattedToken {
  symbol: string;
  name: string;
  logo: string | null;
  balance: number;
  usdValue: number;
  chain: string;
  contractAddress?: string;
  isNative?: boolean;
}

// Define the PriceData interface to match TokenMetadataResponse
interface PriceData {
  contractAddress: string;
  chain: string;
  price: TokenMetadataResponse;
}

// Import TokenMetadataResponse type or define it if not available
interface TokenMetadataResponse {
  decimals?: number;
  logo?: string;
  name?: string;
  symbol?: string;
  usd?: number;
  // Replace this line in the TokenMetadataResponse interface:
  [key: string]: any;
  
  // With this (more specific index signature):
  [key: string]: string | number | undefined;
}

// Update the getTokenPrices function to ensure it returns only PriceData objects
export async function getTokenPrices(tokens: { contractAddress: string, chain: string }[]): Promise<PriceData[]> {
  try {
    const pricePromises = tokens.map(async (token) => {
      const chain = supportedChains.find(c => c.key === token.chain);
      if (!chain) return null;
      
      const alchemy = createAlchemyInstance(chain.network);
      try {
        const price = await alchemy.core.getTokenMetadata(token.contractAddress);
        return {
          contractAddress: token.contractAddress,
          chain: token.chain,
          price: price,
        };
      } catch (error) {
        console.error(`Error fetching price for token ${token.contractAddress}:`, error);
        return null;
      }
    });
    
    const prices = await Promise.all(pricePromises);
    // Use a type assertion instead of a type predicate
    return prices.filter(Boolean) as PriceData[];
  } catch (error) {
    console.error('Error fetching token prices:', error);
    throw error;
  }
}

// Update the formatWalletData function to accept the correct type

// With this (using the NFTData interface):
export function formatWalletData(tokenData: ChainData[], nftData: NFTData[], prices: PriceData[]) {
  // Calculate total value
  let totalValueUsd = 0;
  
  // Format token balances
  const tokenBalances: FormattedToken[] = tokenData.flatMap(chainData => {
    return chainData.tokens.map((token: TokenData) => {
      const tokenBalance = parseFloat(token.tokenBalance) / Math.pow(10, token.metadata.decimals || 18);
      const price = prices.find(p => p?.contractAddress.toLowerCase() === token.contractAddress.toLowerCase());
      const usdValue = price?.price?.usd ? tokenBalance * price.price.usd : 0;
      
      totalValueUsd += usdValue;
      
      return {
        symbol: token.metadata.symbol,
        name: token.metadata.name,
        logo: token.metadata.logo,
        balance: tokenBalance,
        usdValue: usdValue,
        chain: chainData.chain,
        contractAddress: token.contractAddress,
      };
    });
  });
  
  // Add native balances
  tokenData.forEach(chainData => {
    const price = 0; // We would need to get the price of the native token
    const usdValue = chainData.nativeBalance.value * price;
    totalValueUsd += usdValue;
    
    tokenBalances.push({
      symbol: chainData.nativeBalance.symbol,
      name: chainData.nativeBalance.symbol,
      logo: null,
      balance: chainData.nativeBalance.value,
      usdValue: usdValue,
      chain: chainData.chain,
      isNative: true,
    });
  });
  
  // Calculate NFT count
  const nftCount = nftData.reduce((total, chainData) => total + chainData.totalCount, 0);
  
  // Format chain allocation
  const chainAllocation = calculateChainAllocation(tokenBalances, totalValueUsd);
  
  return {
    tokenBalances,
    nativeBalance: {
      value: tokenData[0]?.nativeBalance.value || 0,
      usdValue: tokenData[0]?.nativeBalance.value * 0 || 0, // We would need the price
    },
    nftCount,
    totalValueUsd,
    chainAllocation,
  };
}

// Calculate chain allocation percentages
function calculateChainAllocation(tokenBalances: FormattedToken[], totalValueUsd: number) {
  const chainValues: Record<string, number> = {};
  
  tokenBalances.forEach(token => {
    if (token.usdValue) {
      chainValues[token.chain] = (chainValues[token.chain] || 0) + token.usdValue;
    }
  });
  
  return Object.entries(chainValues).map(([chain, value]) => {
    const chainInfo = supportedChains.find(c => c.key === chain);
    return {
      chain,
      name: chainInfo?.name || chain,
      value: Math.round((value as number / totalValueUsd) * 100),
      fill: getChainColor(chain),
    };
  });
}

// Get color for chain
function getChainColor(chain: string): string {
  switch (chain) {
    case 'ethereum': return '#627EEA';
    case 'optimism': return '#FF0420';
    case 'arbitrum': return '#28A0F0';
    case 'base': return '#8d99ae';
    case 'polygon': return '#8247E5';
    default: return '#888888';
  }
}