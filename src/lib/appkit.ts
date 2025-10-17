import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { base, mainnet, polygon, arbitrum, bsc, celo } from '@reown/appkit/networks'

// Get project ID from environment
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

if (!projectId) {
  throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set')
}

// Networks are defined inline in the configuration

// Create Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
  networks: [base, mainnet, polygon, arbitrum, bsc, celo],
  projectId,
  ssr: true
})

// App metadata
const metadata = {
  name: 'Hedwig',
  description: 'Multi-chain payment platform for seamless crypto transactions',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://hedwigbot.framer.ai',
  icons: ['']
}

// Create AppKit instance
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [base, mainnet, polygon, arbitrum, bsc, celo],
  projectId,
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: [],
    emailShowWallets: true
  },
  themeMode: 'light',
  themeVariables: {
    '--w3m-color-mix': '#00BB7A',
    '--w3m-color-mix-strength': 20,
    '--w3m-font-family': 'Inter, system-ui, sans-serif',
    '--w3m-border-radius-master': '8px'
  }
})

// Export wagmi config for compatibility
export const wagmiConfig = wagmiAdapter.wagmiConfig