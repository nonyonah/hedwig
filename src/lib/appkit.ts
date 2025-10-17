import { http, createConfig } from 'wagmi'
import { base, mainnet, polygon, arbitrum, bsc } from 'wagmi/chains'
import { walletConnect, injected, coinbaseWallet } from 'wagmi/connectors'
import { defineChain } from 'viem'

// Define Celo network
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
})

// Define Lisk network
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
})

// Get project ID from environment
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

// Create wagmi config
export const wagmiConfig = createConfig({
  chains: [base, mainnet, polygon, arbitrum, bsc, celoMainnet, liskMainnet],
  connectors: [
    walletConnect({ 
      projectId,
      metadata: {
        name: 'Hedwig',
        description: 'Multi-chain payment platform for seamless crypto transactions',
        url: 'https://hedwigbot.framer.ai',
        icons: ['']
      }
    }),
    injected({ shimDisconnect: true }),
    coinbaseWallet({ 
      appName: 'Hedwig',
      appLogoUrl: ''
    })
  ],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [bsc.id]: http(),
    [celoMainnet.id]: http(),
    [liskMainnet.id]: http(),
  },
})

// We'll add AppKit integration later once the basic setup works