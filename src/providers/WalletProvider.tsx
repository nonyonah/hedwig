import { useEffect } from 'react';
import { EventEmitter } from 'events';

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

export function WalletProviderWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Increase max listeners when the provider mounts
    increaseMaxListeners();
    
    return () => {
      // Any cleanup if needed
    };
  }, []);

  return children;
}