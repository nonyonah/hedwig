import { useEffect, createContext, useContext, useState, ReactNode } from 'react';
import { EventEmitter } from 'events';

// Define the wallet context type
interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isLoading: boolean;
  network: string | null;
  error: string | null;
}

// Create the context with default values
const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isLoading: true,
  network: null,
  error: null
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
    error: null
  });

  useEffect(() => {
    // Increase max listeners when the provider mounts
    increaseMaxListeners();
    
    // Initialize wallet connection
    const initWallet = async () => {
      try {
        // This would be replaced with actual wallet initialization code
        // For now, we're just simulating the loading state
        setWalletState(prev => ({ ...prev, isLoading: true }));
        
        // Simulated delay to represent wallet connection
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Set wallet as connected with sample data
        setWalletState({
          address: null, // Will be populated when a real wallet connects
          isConnected: false,
          isLoading: false,
          network: null,
          error: null
        });
      } catch (error) {
        console.error('Wallet initialization error:', error);
        setWalletState({
          address: null,
          isConnected: false,
          isLoading: false,
          network: null,
          error: error instanceof Error ? error.message : 'Unknown wallet error'
        });
      }
    };
    
    initWallet();
    
    return () => {
      // Cleanup wallet connection if needed
    };
  }, []);

  return (
    <WalletContext.Provider value={walletState}>
      {children}
    </WalletContext.Provider>
  );
}