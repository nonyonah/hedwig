import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, mainnet, optimismSepolia } from 'wagmi/chains';
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

export const config = getDefaultConfig({
  appName: 'Hedwig Payment',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains: [base, mainnet, optimismSepolia, celoAlfajores],
  ssr: true,
});