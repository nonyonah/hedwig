import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, mainnet, bsc, bscTestnet, polygon, arbitrum, arbitrumSepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { http } from 'viem';

// Helper function to create transport with consistent error handling
const createTransport = () => http(undefined, {
  retryCount: 3,
  retryDelay: 1000,
  onFetchRequest: (request) => {
    // Suppress filter-related errors in console
    const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || '');
    if (bodyStr.includes('eth_getFilterChanges') || bodyStr.includes('eth_getFilterLogs')) {
      console.debug('Filter request detected, handling gracefully');
    }
  },
  onFetchResponse: async (response) => {
    // Handle filter-related errors gracefully
    if (!response.ok) {
      try {
        const errorData = await response.clone().json();
        if (errorData.error && 
            (errorData.error.message?.includes('filter not found') || 
             errorData.error.message?.includes('eth_getFilterChanges') ||
             errorData.error.message?.includes('eth_getFilterLogs') ||
             errorData.error.code === -32600)) {
          console.debug('Filter error suppressed:', errorData.error.message);
          // Log the error but don't modify the response
          // The error handling will be done at the contract level
        }
      } catch (e) {
        console.debug('Error parsing filter response:', e);
      }
    }
    // onFetchResponse should not return anything (void)
  }
});

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
    [base.id]: createTransport(),
    [celoMainnet.id]: createTransport(),
    [mainnet.id]: createTransport(),
    [polygon.id]: createTransport(),
    [arbitrum.id]: createTransport(),
    [arbitrumSepolia.id]: createTransport(),
    [bsc.id]: createTransport(),
    [bscTestnet.id]: createTransport(),
    [liskMainnet.id]: createTransport(),
  },
  ssr: true,
});