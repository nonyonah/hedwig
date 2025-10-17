import { useEffect, createContext, useContext, useState, ReactNode } from 'react';
import { EventEmitter } from 'events';
import { useAppKitWallet } from '../hooks/useAppKitWallet';
import { getChainConfig } from '../lib/chains';

// Define payment types for compatibility
interface PaymentParams {
  to: string;
  amount: string;
  token?: string;
  chainId?: number;
}

interface PaymentResult {
  id: string;
  status: 'success' | 'failed' | 'pending';
  hash?: string;
}

// Define the wallet context type
interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isLoading: boolean;
  network: string | null;
  error: string | null;
  baseAccount: any | null; // Simplified for compatibility
  connectBaseAccount: () => Promise<void>;
  disconnectWallet: () => void;
  signMessage: (message: string) => Promise<string>;
  pay: (params: PaymentParams) => Promise<PaymentResult>;
}

// Create the context with default values
const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isLoading: true,
  network: null,
  error: null,
  baseAccount: null,
  connectBaseAccount: async () => {},
  disconnectWallet: () => {},
  signMessage: async () => '',
  pay: async () => ({ id: '', status: 'failed' }),
});

// Increase the max listeners limit for EventEmitter
const increaseMaxListeners = () => {
  try {
    EventEmitter.defaultMaxListeners = 20;
    console.log('Increased EventEmitter max listeners limit');
  } catch (error) {
    console.error('Failed to increase EventEmitter max listeners:', error);
  }
};

// Hook to access wallet context - now uses AppKit
export function useWallet() {
  const context = useContext(WalletContext);
  const appKitWallet = useAppKitWallet();
  
  // Return AppKit wallet if context is not available (for new components)
  if (!context.isConnected && appKitWallet.isConnected) {
    return {
      ...context,
      address: appKitWallet.address || null,
      isConnected: appKitWallet.isConnected,
      isLoading: appKitWallet.isConnecting,
      network: appKitWallet.chainId ? getChainConfig(appKitWallet.chainId)?.name || null : null,
      connectBaseAccount: appKitWallet.connectWallet,
      disconnectWallet: appKitWallet.disconnectWallet,
    };
  }
  
  return context;
}

export function WalletProviderWrapper({ children }: { children: ReactNode }) {
  const appKitWallet = useAppKitWallet();
  
  const [walletState, setWalletState] = useState<WalletContextType>({
    address: null,
    isConnected: false,
    isLoading: true,
    network: null,
    error: null,
    baseAccount: null,
    connectBaseAccount: async () => {},
    disconnectWallet: () => {},
    signMessage: async () => '',
    pay: async () => ({ id: '', status: 'failed' }),
  });

  // Sync AppKit wallet state with context
  useEffect(() => {
    setWalletState(prev => ({
      ...prev,
      address: appKitWallet.address || null,
      isConnected: appKitWallet.isConnected,
      isLoading: appKitWallet.isConnecting,
      network: appKitWallet.chainId ? getChainConfig(appKitWallet.chainId)?.name || null : null,
    }));
  }, [appKitWallet.address, appKitWallet.isConnected, appKitWallet.isConnecting, appKitWallet.chainId]);

  // Connect wallet - now uses AppKit
  const connectBaseAccount = async () => {
    try {
      setWalletState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Use AppKit to connect
      await appKitWallet.connectWallet();
      
      // Track wallet connection event
      try {
        const { HedwigEvents } = await import('../lib/posthog');
        await HedwigEvents.walletConnected(appKitWallet.address || 'unknown', 'appkit');
        console.log('✅ Wallet connected event tracked successfully');
      } catch (trackingError) {
        console.error('Error tracking wallet_connected event:', trackingError);
      }

    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setWalletState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect',
      }));
    }
  };

  // Disconnect wallet - now uses AppKit
  const disconnectWallet = async () => {
    try {
      await appKitWallet.disconnectWallet();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  // Sign message using AppKit
  const signMessage = async (message: string): Promise<string> => {
    if (!appKitWallet.isConnected || !appKitWallet.address) {
      throw new Error('Wallet not connected');
    }
    return await appKitWallet.signMessage(message);
  };

  // Make payment - simplified for now
  const pay = async (params: PaymentParams): Promise<PaymentResult> => {
    // This would need to be implemented with actual transaction sending
    // For now, return a placeholder
    console.log('Payment requested:', params);
    return { id: 'placeholder', status: 'pending' };
  };

  useEffect(() => {
    // Increase max listeners when the provider mounts
    increaseMaxListeners();
    
    // Update wallet state with functions
    setWalletState(prev => ({
      ...prev,
      connectBaseAccount,
      disconnectWallet,
      signMessage,
      pay,
      baseAccount: null, // Simplified for now
      isLoading: false,
    }));
  }, [appKitWallet]);

  return (
    <WalletContext.Provider value={walletState}>
      {children}
    </WalletContext.Provider>
  );
}