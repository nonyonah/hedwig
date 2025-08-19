import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia, mainnet, optimismSepolia, bsc, bscTestnet } from 'wagmi/chains';
import { defineChain } from 'viem';

// Define Celo Alfajores testnet configuration
const celoAlfajores = defineChain({
  id: 44787,
  name: 'Celo Alfajores',
  nativeCurrency: {
    decimals: 18,
    name: 'Celo',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: {
      http: ['https://alfajores-forno.celo-testnet.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Celo Alfajores Explorer',
      url: 'https://explorer.celo.org/alfajores',
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
  // Prefer Base Sepolia first to ensure testnet is the default chain for connections
  chains: [baseSepolia, base, mainnet, optimismSepolia, celoAlfajores], // BEP20 and Asset Chain are DISABLED
  ssr: true,
});