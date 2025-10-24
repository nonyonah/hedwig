import { useAccount, useConnect, useDisconnect, useSwitchChain, useSignMessage } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { useCallback } from 'react'
import { getChainById, isChainSupported } from '../lib/chains'

/**
 * Enhanced wallet hook that provides a unified interface for wallet operations
 * Compatible with AppKit and provides additional utility functions
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
  const { open, close } = useAppKit()

  // Get current chain information
  const currentChain = chainId ? getChainById(chainId) : null
  const isCurrentChainSupported = chainId ? isChainSupported(chainId) : false

  // Connect to wallet using AppKit modal
  const connectWallet = useCallback(async (connectorId?: string) => {
    try {
      if (connectorId) {
        // Connect to specific connector
        const targetConnector = connectors.find(c => c.id === connectorId)
        if (targetConnector) {
          connect({ connector: targetConnector })
        }
      } else {
        // Open AppKit modal for wallet selection
        open()
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      throw error
    }
  }, [connect, connectors, open])

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
      // Coerce to number in case a string slips through from callers
      const id = Number(targetChainId)

      // If we know the chain, great; if not, still attempt switch
      const targetChain = getChainById(id)
      if (!targetChain) {
        console.warn(`Unknown chain ${id}; attempting switch anyway`)
      }
      
      await switchChain({ chainId: id })
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
    isChainSupported: isCurrentChainSupported,
    connector,
    status,
    
    // Chain operations
    switchToChain,
    isSwitching,
    
    // Connection operations
    connectWallet,
    disconnectWallet,
    availableConnectors,
    
    // AppKit operations
    openModal: open,
    closeModal: close,
    
    // Signing operations
    signMessage: signMessageAsync,
    isSigning,
    
    // Utility functions
    getChainName: () => currentChain?.name || 'Unknown',
    getChainId: () => chainId,
    isWrongNetwork: (expectedChainId: number) => chainId !== expectedChainId,
  }
}