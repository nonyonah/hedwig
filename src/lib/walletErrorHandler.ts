/**
 * Wallet error handling utilities for AppKit integration
 */

export interface WalletError {
  code: string;
  message: string;
  details?: any;
}

export class WalletErrorHandler {
  static handleConnectionError(error: any): WalletError {
    console.error('Wallet connection error:', error);
    
    // Handle common wallet connection errors
    if (error?.code === 4001) {
      return {
        code: 'USER_REJECTED',
        message: 'Connection request was rejected by the user',
        details: error
      };
    }
    
    if (error?.code === -32002) {
      return {
        code: 'ALREADY_PENDING',
        message: 'A connection request is already pending. Please check your wallet.',
        details: error
      };
    }
    
    if (error?.message?.includes('No provider')) {
      return {
        code: 'NO_PROVIDER',
        message: 'No wallet provider found. Please install a wallet extension.',
        details: error
      };
    }
    
    if (error?.message?.includes('Unsupported chain')) {
      return {
        code: 'UNSUPPORTED_CHAIN',
        message: 'The selected network is not supported. Please switch to a supported network.',
        details: error
      };
    }
    
    return {
      code: 'CONNECTION_FAILED',
      message: error?.message || 'Failed to connect to wallet',
      details: error
    };
  }
  
  static handleTransactionError(error: any): WalletError {
    console.error('Transaction error:', error);
    
    // Handle common transaction errors
    if (error?.code === 4001) {
      return {
        code: 'USER_REJECTED_TX',
        message: 'Transaction was rejected by the user',
        details: error
      };
    }
    
    if (error?.code === -32603) {
      return {
        code: 'INTERNAL_ERROR',
        message: 'Internal wallet error occurred',
        details: error
      };
    }
    
    if (error?.message?.includes('insufficient funds')) {
      return {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Insufficient funds to complete the transaction',
        details: error
      };
    }
    
    if (error?.message?.includes('gas')) {
      return {
        code: 'GAS_ERROR',
        message: 'Gas estimation failed or gas limit exceeded',
        details: error
      };
    }
    
    return {
      code: 'TRANSACTION_FAILED',
      message: error?.message || 'Transaction failed',
      details: error
    };
  }
  
  static handleNetworkError(error: any): WalletError {
    console.error('Network error:', error);
    
    if (error?.code === 4902) {
      return {
        code: 'NETWORK_NOT_ADDED',
        message: 'The network needs to be added to your wallet',
        details: error
      };
    }
    
    if (error?.code === -32602) {
      return {
        code: 'INVALID_PARAMS',
        message: 'Invalid network parameters',
        details: error
      };
    }
    
    return {
      code: 'NETWORK_ERROR',
      message: error?.message || 'Network operation failed',
      details: error
    };
  }
  
  static handleSigningError(error: any): WalletError {
    console.error('Signing error:', error);
    
    if (error?.code === 4001) {
      return {
        code: 'USER_REJECTED_SIGNING',
        message: 'Message signing was rejected by the user',
        details: error
      };
    }
    
    return {
      code: 'SIGNING_FAILED',
      message: error?.message || 'Failed to sign message',
      details: error
    };
  }
  
  static getErrorMessage(error: WalletError): string {
    return error.message;
  }
  
  static isUserRejection(error: WalletError): boolean {
    return ['USER_REJECTED', 'USER_REJECTED_TX', 'USER_REJECTED_SIGNING'].includes(error.code);
  }
  
  static shouldRetry(error: WalletError): boolean {
    return !['USER_REJECTED', 'USER_REJECTED_TX', 'USER_REJECTED_SIGNING', 'NO_PROVIDER'].includes(error.code);
  }
}