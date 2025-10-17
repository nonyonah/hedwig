import { useAccount, useConnect, useDisconnect, useSwitchChain, useSignMessage } from 'wagmi'
import { useCallback } from 'react'
import { getChainById, isChainSupported } from '../lib/chains'

/**
 * Enhanced wallet hook that provides a unified interface for wallet operations
 * Compatible with both the old wallet system and new AppKit/Wagmi setup
 */
export function useAppKitWallet() {
  const { 
    address, 
    isConnected, 
    chainId, 
    connector,
    status 
  } = useAccount()
  
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { signMessage, isPending: isSigning } = useSignMessage()

  // Get current chain information
  const currentChain = chainId ? getChainById(chainId) : null
  const isChainSupported = chainId ? isChainSupported(chainId) : false

  // Connect to wallet
  const connectWallet = useCallback(async (connectorId?: string) => {
    try {
      const targetConnector = connectorId 
        ? connectors.find(c => c.id === connectorId)
        : connectors[0] // Default to first available connector
      
      if (targetConnector) {
        connect({ connector: targetConnector })
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      throw error
    }
  }, [connect, connectors])

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    try {
      disconnect()
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
      throw error
    }
  }, [disconnect])

  // Switch to a different chain
  const switchToChain = useCallback(async (targetChainId: number) => {
    try {
      if (!isChainSupported(targetChainId)) {
        throw new Error(`Chain ${targetChainId} is not supported`)
      }
      
      switchChain({ chainId: targetChainId })
    } catch (error) {
      console.error('Failed to switch chain:', error)
      throw error
    }
  }, [switchChain])

  // Sign a message
  const signMessageAsync = useCallback(async (message: string) => {
    try {
      if (!isConnected || !address) {
        throw new Error('Wallet not connected')
      }
      
      return new Promise<string>((resolve, reject) => {
        signMessage(
          { message },
          {
            onSuccess: (signature) => resolve(signature),
            onError: (error) => reject(error)
          }
        )
      })
    } catch (error) {
      console.error('Failed to sign message:', error)
      throw error
    }
  }, [signMessage, isConnected, address])

  // Get available connectors
  const availableConnectors = connectors.map(connector => ({
    id: connector.id,
    name: connector.name,
    icon: connector.icon,
    ready: connector.ready
  }))

  return {
    // Connection state
    address,
    isConnected,
    isConnecting,
    chainId,
    currentChain,
    isChainSupported,
    connector,
    status,
    
    // Chain operations
    switchToChain,
    isSwitching,
    
    // Connection operations
    connectWallet,
    disconnectWallet,
    availableConnectors,
    
    // Signing operations
    signMessage: signMessageAsync,
    isSigning,
    
    // Utility functions
    getChainName: () => currentChain?.name || 'Unknown',
    getChainId: () => chainId,
    isWrongNetwork: (expectedChainId: number) => chainId !== expectedChainId,
  }
}