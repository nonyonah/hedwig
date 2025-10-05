import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, mainnet, bsc, bscTestnet, polygon, arbitrum, arbitrumSepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { http } from 'viem';

// Define Celo Mainnet configuration
const celoMainnet = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: {
    decimals: 18,
    name: 'Celo',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: {
      http: ['https://forno.celo.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Celo Explorer',
      url: 'https://celoscan.io',
    },
  },
  testnet: false,
});

// Define Asset Chain (RWA Chain) configuration - DISABLED
const assetChain = defineChain({
  id: 42421,
  name: 'Asset Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'Real World Asset',
    symbol: 'RWA',
  },
  rpcUrls: {
    default: {
      http: ['https://enugu-rpc.assetchain.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Asset Chain Explorer',
      url: 'https://scan.assetchain.org',
    },
  },
  testnet: false,
});

// Define Lisk Mainnet configuration
const liskMainnet = defineChain({
  id: 1135,
  name: 'Lisk',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.api.lisk.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Lisk Explorer',
      url: 'https://blockscout.lisk.com',
    },
  },
  testnet: false,
});

// Define Asset Chain Testnet configuration - DISABLED
const assetChainTestnet = defineChain({
  id: 42420,
  name: 'Asset Chain Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Real World Asset',
    symbol: 'RWA',
  },
  rpcUrls: {
    default: {
      http: ['https://enugu-rpc.assetchain.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Asset Chain Testnet Explorer',
      url: 'https://scan-testnet.assetchain.org',
    },
  },
  testnet: true,
});

// DISABLED CHAINS - BEP20 and Asset Chain are defined but not included in active chains
// const disabledChains = [bsc, bscTestnet, assetChain, assetChainTestnet];

export const config = getDefaultConfig({
  appName: 'Hedwig Payment',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  // Added testnet chains for testing
  chains: [base, mainnet, polygon, arbitrum, arbitrumSepolia, bsc, bscTestnet, celoMainnet, liskMainnet], // Added testnet chains for testing
  transports: {
    [base.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
      onFetchRequest: (request) => {
        // Suppress eth_getFilterChanges errors in console
        const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || '');
        if (bodyStr.includes('eth_getFilterChanges')) {
          console.debug('Filter request:', request.method);
        }
      },
      onFetchResponse: (response) => {
        // Handle filter-related errors gracefully
        if (!response.ok && response.status === 400) {
          console.debug('Filter response error handled gracefully');
        }
      }
    }),
    [celoMainnet.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    [mainnet.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    [polygon.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    [arbitrum.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    [arbitrumSepolia.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    [bsc.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    [bscTestnet.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    [liskMainnet.id]: http(undefined, {
      retryCount: 3,
      retryDelay: 1000,
    }),
  },
  ssr: true,
});