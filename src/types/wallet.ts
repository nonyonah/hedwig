/**
 * Types for wallet export functionality
 */

/**
 * Wallet export request status
 */
export type WalletExportStatus = 'pending' | 'ready' | 'completed' | 'failed';

/**
 * Wallet export request interface
 */
export interface WalletExportRequest {
  id: string;
  user_phone: string;
  wallet_id: string;
  wallet_address: string;
  export_token: string;
  encrypted_private_key?: string;
  encapsulation?: string;
  recipient_public_key: string;
  recipient_private_key: string;
  status: WalletExportStatus;
  created_at: string;
  expires_at: string;
  completed_at?: string;
}

/**
 * Response from Privy wallet export
 */
export interface PrivyWalletExportResponse {
  encrypted_private_key: string;
  encapsulation: string;
}

/**
 * Error types for better error handling
 */
// Note: WhatsApp-specific types have been removed in favor of Telegram integration

export interface PrivyError extends Error {
  message: string;
  status?: number;
  details?: any;
}

export interface DecryptionError extends Error {
  message: string;
  details?: any;
}