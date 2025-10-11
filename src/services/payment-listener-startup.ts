import { multiNetworkPaymentService } from './MultiNetworkPaymentService';

let isListenerRunning = false;

/**
 * Initialize and start the multi-network payment event listener
 */
export async function startPaymentListener(): Promise<boolean> {
  if (isListenerRunning) {
    console.log('Multi-network payment listener is already running');
    return true;
  }

  try {
    console.log('🚀 Initializing multi-network payment listener service...');
    
    // Start listening for payment events across all networks
    await multiNetworkPaymentService.startListening();

    isListenerRunning = true;
    console.log('✅ Multi-network payment event listener started successfully');
    
    // Log the status of all networks
    const status = multiNetworkPaymentService.getStatus();
    console.log('📊 Network Status:', status);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to start multi-network payment listener:', error);
    return false;
  }
}



/**
 * Stop the multi-network payment listener
 */
export function stopPaymentListener(): void {
  if (isListenerRunning) {
    multiNetworkPaymentService.stopListening();
    isListenerRunning = false;
    console.log('✅ Multi-network payment listener stopped');
  }
}

/**
 * Check if the payment listener is running
 */
export function isPaymentListenerRunning(): boolean {
  return isListenerRunning;
}

/**
 * Get multi-network payment listener status
 */
export function getPaymentListenerStatus() {
  const status = multiNetworkPaymentService.getStatus();
  return {
    ...status,
    isRunning: isListenerRunning
  };
}