import { useEffect, createContext, useContext, useState, ReactNode } from 'react';
import { EventEmitter } from 'events';
import { createBaseAccountService, BaseAccountService, PaymentParams, PaymentResult } from '@/lib/baseAccount';

// Define the wallet context type
interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isLoading: boolean;
  network: string | null;
  error: string | null;
  baseAccount: BaseAccountService | null;
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
// This helps prevent the warning but doesn't solve the underlying issue
const increaseMaxListeners = () => {
  // Find the EventEmitter instance used by WalletConnect
  // This is a bit of a hack but works in most cases
  try {
    // Set a higher limit for all EventEmitter instances
    EventEmitter.defaultMaxListeners = 20;
    
    // If you can access the specific emitter instance:
    // walletConnectProvider.events.setMaxListeners(20);
    console.log('Increased EventEmitter max listeners limit');
  } catch (error) {
    console.error('Failed to increase EventEmitter max listeners:', error);
  }
};

// Hook to access wallet context
export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProviderWrapper({ children }: { children: ReactNode }) {
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

  const [baseAccountService, setBaseAccountService] = useState<BaseAccountService | null>(null);

  // Initialize Base Account service
  useEffect(() => {
    const service = createBaseAccountService({
      appName: 'Hedwig - Your Trusted Wallet Assistant',
      testnet: process.env.NODE_ENV === 'development',
    });
    setBaseAccountService(service);
  }, []);

  // Connect to Base Account
  const connectBaseAccount = async () => {
    if (!baseAccountService) {
      throw new Error('Base Account service not initialized');
    }

    try {
      setWalletState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const addresses = await baseAccountService.connect();
      const chainId = await baseAccountService.getChainId();
      
      // Convert chain ID to network name
      const networkName = getNetworkName(chainId);
      
      setWalletState(prev => ({
        ...prev,
        address: addresses[0] || null,
        isConnected: addresses.length > 0,
        isLoading: false,
        network: networkName,
        error: null,
        baseAccount: baseAccountService,
      }));

      // Setup event listeners
      baseAccountService.setupEventListeners({
        onConnect: async (info) => {
          console.log('Base Account connected:', info);
          
          // Track wallet connection event
          try {
            const { HedwigEvents } = await import('../lib/posthog');
            await HedwigEvents.walletConnected('base_account', 'base_account');
            console.log('✅ Wallet connected event tracked successfully');
          } catch (trackingError) {
            console.error('Error tracking wallet_connected event:', trackingError);
          }
        },
        onDisconnect: (error) => {
          console.log('Base Account disconnected:', error);
          setWalletState(prev => ({
            ...prev,
            address: null,
            isConnected: false,
            network: null,
            error: error?.message || 'Disconnected',
          }));
        },
        onAccountsChanged: (accounts) => {
          console.log('Accounts changed:', accounts);
          setWalletState(prev => ({
            ...prev,
            address: accounts[0] || null,
            isConnected: accounts.length > 0,
          }));
        },
        onChainChanged: (chainId) => {
          console.log('Chain changed:', chainId);
          const networkName = getNetworkName(chainId);
          setWalletState(prev => ({
            ...prev,
            network: networkName,
          }));
        },
      });

    } catch (error) {
      console.error('Failed to connect Base Account:', error);
      setWalletState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect',
      }));
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    if (baseAccountService) {
      baseAccountService.removeEventListeners();
    }
    setWalletState(prev => ({
      ...prev,
      address: null,
      isConnected: false,
      network: null,
      error: null,
    }));
  };

  // Sign message
  const signMessage = async (message: string): Promise<string> => {
    if (!baseAccountService || !walletState.address) {
      throw new Error('Wallet not connected');
    }
    return await baseAccountService.signMessage(message, walletState.address);
  };

  // Make payment
  const pay = async (params: PaymentParams): Promise<PaymentResult> => {
    if (!baseAccountService) {
      throw new Error('Base Account service not available');
    }
    return await baseAccountService.pay(params);
  };

  // Helper function to convert chain ID to network name
  const getNetworkName = (chainId: string): string => {
    const id = parseInt(chainId, 16);
    switch (id) {
      case 8453: return 'Base';
    case 84532: return 'Base Sepolia';
      case 1: return 'Ethereum Mainnet';
      case 11155111: return 'Ethereum Sepolia';
      default: return `Chain ${id}`;
    }
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
      baseAccount: baseAccountService,
      isLoading: false,
    }));
    
    return () => {
      // Cleanup wallet connection if needed
      if (baseAccountService) {
        baseAccountService.removeEventListeners();
      }
    };
  }, [baseAccountService]);

  return (
    <WalletContext.Provider value={walletState}>
      {children}
    </WalletContext.Provider>
  );
}