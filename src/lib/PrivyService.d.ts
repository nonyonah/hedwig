// Type definitions for PrivyService.js
import { WalletExportRequest } from '../types/wallet';

declare class PrivyService {
  constructor(privyUserId: string);
  
  /**
   * Generate a secure random token for wallet export
   */
  generateSecureToken(): string;
  
  /**
   * Check if a user has exceeded rate limits for wallet exports
   */
  checkRateLimit(phone: string): Promise<{ isRateLimited: boolean, remainingAttempts: number }>;
  
  /**
   * Generate HPKE key pair for secure wallet export
   */
  generateHpkeKeyPair(): Promise<{ publicKey: string, privateKey: string }>;
  
  /**
   * Create a new wallet export request in the database
   */
  createExportRequest(
    phone: string,
    walletId: string,
    walletAddress: string,
    publicKey: string,
    privateKey: string
  ): Promise<{ exportToken: string }>;
  
  /**
   * Update export request status
   */
  updateExportRequestStatus(token: string, status: string): Promise<void>;
  
  /**
   * Mark export request as completed
   */
  completeExportRequest(token: string): Promise<void>;
  
  /**
   * Update export request with encrypted data from Privy
   */
  updateExportRequestWithEncryptedData(
    token: string,
    encryptedPrivateKey: string,
    encapsulation: string
  ): Promise<void>;
  
  /**
   * Decrypt private key using HPKE
   */
  decryptPrivateKey(
    encryptedPrivateKey: string,
    encapsulation: string,
    recipientPrivateKey: string
  ): Promise<string>;
  
  /**
   * Static methods
   */
  static getExportRequest(token: string): Promise<WalletExportRequest | null>;
  
  static decryptPrivateKey(
    encryptedPrivateKey: string,
    encapsulation: string,
    recipientPrivateKey: string
  ): Promise<string>;
  
  static completeExportRequest(token: string): Promise<void>;
  
  static updateExportRequestStatus(token: string, status: string): Promise<void>;
}

export default PrivyService;