import { defineChain } from 'viem'
import { base, mainnet, polygon, arbitrum, bsc } from 'viem/chains'

// Celo Mainnet configuration
export const celoMainnet = defineChain({
  id: 42220,
  name: 'Celo',
  network: 'celo',
  nativeCurrency: {
    decimals: 18,
    name: 'CELO',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: {
      http: ['https://forno.celo.org'],
    },
    public: {
      http: ['https://forno.celo.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Celo Explorer', url: 'https://explorer.celo.org' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 13112599,
    },
  },
})

// Lisk Mainnet configuration
export const liskMainnet = defineChain({
  id: 1135,
  name: 'Lisk',
  network: 'lisk',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.api.lisk.com'],
    },
    public: {
      http: ['https://rpc.api.lisk.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Lisk Explorer', url: 'https://blockscout.lisk.com' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 0,
    },
  },
})

// All supported chains
export const supportedChains = [
  base,
  mainnet,
  polygon,
  arbitrum,
  bsc,
  celoMainnet,
  liskMainnet,
] as const

// Chain configuration mapping
export const chainConfig = {
  [base.id]: {
    name: 'Base',
    shortName: 'base',
    icon: '/chains/base.svg',
    color: '#0052FF',
    nativeToken: 'ETH',
    primaryTokens: ['ETH', 'USDC', 'USDT'],
  },
  [mainnet.id]: {
    name: 'Ethereum',
    shortName: 'ethereum',
    icon: '/chains/ethereum.svg',
    color: '#627EEA',
    nativeToken: 'ETH',
    primaryTokens: ['ETH', 'USDC', 'USDT', 'DAI'],
  },
  [polygon.id]: {
    name: 'Polygon',
    shortName: 'polygon',
    icon: '/chains/polygon.svg',
    color: '#8247E5',
    nativeToken: 'MATIC',
    primaryTokens: ['MATIC', 'USDC', 'USDT'],
  },
  [arbitrum.id]: {
    name: 'Arbitrum',
    shortName: 'arbitrum',
    icon: '/chains/arbitrum.svg',
    color: '#28A0F0',
    nativeToken: 'ETH',
    primaryTokens: ['ETH', 'USDC', 'USDT'],
  },
  [bsc.id]: {
    name: 'BNB Smart Chain',
    shortName: 'bsc',
    icon: '/chains/bsc.svg',
    color: '#F3BA2F',
    nativeToken: 'BNB',
    primaryTokens: ['BNB', 'USDC', 'USDT'],
  },
  [celoMainnet.id]: {
    name: 'Celo',
    shortName: 'celo',
    icon: '/chains/celo.svg',
    color: '#35D07F',
    nativeToken: 'CELO',
    primaryTokens: ['CELO', 'CUSD', 'USDC'],
  },
  [liskMainnet.id]: {
    name: 'Lisk',
    shortName: 'lisk',
    icon: '/chains/lisk.svg',
    color: '#0981D1',
    nativeToken: 'ETH',
    primaryTokens: ['ETH', 'LSK'],
  },
} as const

// Helper functions
export function getChainById(chainId: number) {
  return supportedChains.find(chain => chain.id === chainId)
}

export function getChainConfig(chainId: number) {
  return chainConfig[chainId as keyof typeof chainConfig]
}

export function isChainSupported(chainId: number): boolean {
  return supportedChains.some(chain => chain.id === chainId)
}

export function getDefaultChain() {
  return base // Base is our primary network
}

// Network switching utilities
export function getNetworkSwitchParams(chainId: number) {
  const chain = getChainById(chainId)
  if (!chain) return null

  return {
    chainId: `0x${chainId.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrls.default.http,
    blockExplorerUrls: [chain.blockExplorers?.default?.url].filter(Boolean),
  }
}