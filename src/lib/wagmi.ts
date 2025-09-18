import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia, mainnet, optimismSepolia, bsc, bscTestnet } from 'wagmi/chains';
import { defineChain } from 'viem';

// Define Celo Sepolia testnet configuration
const celoSepolia = defineChain({
  id: 11142220,
  name: 'Celo Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Celo',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: {
      http: ['https://forno.celo-sepolia.celo-testnet.org/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Celo Sepolia Explorer',
      url: 'https://celo-sepolia.blockscout.com/',
    },
  },
  testnet: true,
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

// Define Lisk Sepolia testnet configuration
const liskSepolia = defineChain({
  id: 4202,
  name: 'Lisk Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Sepolia Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://4202.rpc.thirdweb.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Lisk Sepolia Explorer',
      url: 'https://sepolia-blockscout.lisk.com',
    },
  },
  testnet: true,
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
  // Prefer Base Mainnet first for production deployment
  chains: [base, mainnet, baseSepolia, optimismSepolia, celoSepolia, liskSepolia], // Celo Sepolia and Lisk Sepolia testnets now ENABLED
  ssr: true,
});