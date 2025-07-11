// src/lib/PrivyService.js
import { createClient } from '@supabase/supabase-js';
const { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } = require('@hpke/core');
const { Chacha20Poly1305 } = require('@hpke/chacha20poly1305');
import { v4 as uuidv4 } from 'uuid';


// Environment variables
const PRIVY_API_URL = process.env.PRIVY_API_URL || 'https://auth.privy.io/api';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);



/**
 * PrivyService class for handling wallet export functionality.
 * This class should be instantiated with a privyUserId.
 */
class PrivyService {
  constructor(privyUserId) {
    if (!privyUserId) {
      throw new Error('PrivyService must be initialized with a privyUserId.');
    }
    this.privyUserId = privyUserId;
  }

  /**
   * Generate a secure random token for wallet export
   * @returns {string} A secure random token
   */
  generateSecureToken() {
    const uuid = uuidv4().replace(/-/g, '');
    const randomBytes = require('crypto').randomBytes(8).toString('hex');
    return `${uuid}${randomBytes}`;
  }

  /**
   * Check if a user has exceeded rate limits for wallet exports
   * @param {string} phone User's phone number
   * @returns {Promise<boolean>} True if rate limited, false otherwise
   */
  /**
   * Check if a user has exceeded rate limits for wallet exports
   * @param {string} phone User's phone number
   * @returns {Promise<{isRateLimited: boolean, remainingAttempts: number}>} Rate limit status
   */
  async checkRateLimit(phone) {
    try {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const maxAttempts = 10; // Increased from 3 to 10

      const { count, error } = await supabase
        .from('wallet_export_requests')
        .select('id', { count: 'exact' })
        .eq('user_phone', phone)
        .gte('created_at', oneHourAgo.toISOString());

      if (error) {
        console.error('Error checking rate limit:', error);
        return { isRateLimited: false, remainingAttempts: maxAttempts };
      }

      const remainingAttempts = Math.max(0, maxAttempts - (count || 0));
      const isRateLimited = (count || 0) >= maxAttempts;
      
      if (isRateLimited) {
        console.warn(`[Rate Limit] User ${phone} has exceeded rate limit (${maxAttempts} attempts/hour).`);
      } else {
        console.log(`[Rate Limit] User ${phone} has ${remainingAttempts} attempts remaining.`);
      }

      return { isRateLimited, remainingAttempts };
    } catch (error) {
      console.error('Error in rate limit check:', error);
      return false;
    }
  }

  /**
   * Generate HPKE key pair for secure wallet export
   * @returns {Promise<{publicKey: string, privateKey: string}>} The HPKE key pair
   */
  async generateHpkeKeyPair() {
    try {
      const suite = new CipherSuite({
        kem: new DhkemP256HkdfSha256(),
        kdf: new HkdfSha256(),
        aead: new Chacha20Poly1305(),
      });

      const keyPair = await suite.kem.generateKeyPair();

      const publicKeyBytes = await suite.kem.serializePublicKey(keyPair.publicKey);
      const privateKeyBytes = await suite.kem.serializePrivateKey(keyPair.privateKey);

      // Convert to base64 for storage and API calls
      const publicKey = Buffer.from(publicKeyBytes).toString('base64');
      const privateKey = Buffer.from(privateKeyBytes).toString('base64');

      return { publicKey, privateKey };
    } catch (error) {
      console.error('Error generating HPKE key pair:', error);
      throw new Error('Failed to generate encryption keys');
    }
  }

  /**
   * Decrypt private key using HPKE
   * @param {string} encryptedPrivateKey Encrypted private key from Privy
   * @param {string} encapsulation HPKE encapsulation from Privy
   * @param {string} recipientPrivateKey HPKE private key (base64)
   * @returns {Promise<string>} Decrypted private key
   */
  async decryptPrivateKey(encryptedPrivateKey, encapsulation, recipientPrivateKey) {
    try {
      const suite = new CipherSuite({
        kem: new DhkemP256HkdfSha256(),
        kdf: new HkdfSha256(),
        aead: new Chacha20Poly1305(),
      });

      const ikm = Buffer.from(recipientPrivateKey, 'base64');
      const keyPair = await suite.kem.importKey('raw', ikm, false);

      const rkp = keyPair;

      const sender = await suite.createRecipientContext({
        recipientKey: rkp,
        enc: Buffer.from(encapsulation, 'base64'),
      });

      const decrypted = await sender.open(Buffer.from(encryptedPrivateKey, 'base64'));

      return Buffer.from(decrypted).toString('utf-8');
    } catch (error) {
      console.error('Error decrypting private key:', error);
      throw new Error('Failed to decrypt private key');
    }
  }

  

  /**
   * Create a new wallet export request in the database
   * @param {string} phone User's phone number
   * @param {string} walletId Privy wallet ID
   * @param {string} walletAddress Wallet address
   * @param {string} publicKey HPKE public key (base64)
   * @param {string} privateKey HPKE private key (base64)
   * @returns {Promise<{exportToken: string}>} Export token
   */
  async createExportRequest(phone, walletId, walletAddress, publicKey, privateKey) {
    try {
      const exportToken = this.generateSecureToken();

      // Create expiration date in UTC to avoid timezone issues
      const now = new Date();
      // Set expiration to 24 hours from now to give users more time
      const expiresAt = new Date(now.getTime() + (24 * 60 * 60 * 1000));
      
      console.log(`[createExportRequest] Creating token that expires at: ${expiresAt.toISOString()} (UTC)`);

      const { error } = await supabase.from('wallet_export_requests').insert([
        {
          user_phone: phone,
          wallet_id: walletId,
          wallet_address: walletAddress,
          export_token: exportToken,
          recipient_public_key: publicKey,
          recipient_private_key: privateKey,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        },
      ]);

      if (error) {
        console.error('Error creating export request:', error);
        throw new Error('Failed to create export request');
      }

      return { exportToken };
    } catch (error) {
      console.error('Error in createExportRequest:', error);
      throw error;
    }
  }

  /**
   * Get export request details by token
   * @param {string} token Export token
   * @returns {Promise<Object|null>} Export request details or null if not found
   */
  static async getExportRequest(token) {
    try {
      if (!token) {
        console.error('No token provided to getExportRequest');
        return null;
      }
      
      console.log(`[getExportRequest] Looking up token: ${token.substring(0, 8)}...`);
      
      const { data, error } = await supabase
        .from('wallet_export_requests')
        .select('*')
        .eq('export_token', token)
        .single();
        
      if (error) {
        console.error('Error fetching export request:', error);
        return null;
      }
      
      if (!data) {
        console.log(`[getExportRequest] No export request found for token`);
        return null;
      }
      
      console.log(`[getExportRequest] Found export request with status: ${data.status}`);
      console.log(`[getExportRequest] Expires at: ${data.expires_at}`);
      
      // Ensure the data has all required fields
      if (!data.wallet_address || !data.status || !data.expires_at) {
        console.error('Invalid export request data:', data);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getExportRequest:', error);
      throw error;
    }
  }

  /**
   * Update export request status
   * @param {string} token Export token
   * @param {string} status New status ('pending', 'ready', 'completed', 'failed')
   * @returns {Promise<void>}
   */
  async updateExportRequestStatus(token, status) {
    try {
      const updates = { status };

      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('wallet_export_requests')
        .update(updates)
        .eq('export_token', token);

      if (error) {
        console.error('Error updating export request status:', error);
        throw new Error('Failed to update export request status');
      }
    } catch (error) {
      console.error('Error in updateExportRequestStatus:', error);
      throw error;
    }
  }

  /**
   * Mark export request as completed
   * @param {string} token Export token
   * @returns {Promise<void>}
   */
  async completeExportRequest(token) {
    return this.updateExportRequestStatus(token, 'completed');
  }

  /**
   * Update export request with encrypted data from Privy
   * @param {string} token Export token
   * @param {string} encryptedPrivateKey Encrypted private key from Privy
   * @param {string} encapsulation HPKE encapsulation from Privy
   * @returns {Promise<void>}
   */
  async updateExportRequestWithEncryptedData(
    token,
    encryptedPrivateKey,
    encapsulation
  ) {
    try {
      const { error } = await supabase
        .from('wallet_export_requests')
        .update({
          encrypted_private_key: encryptedPrivateKey,
          encapsulation: encapsulation,
        })
        .eq('export_token', token);

      if (error) {
        console.error(
          'Error updating export request with encrypted data:',
          error
        );
        throw new Error('Failed to update export request with encrypted data');
      }
    } catch (error) {
      console.error('Error in updateExportRequestWithEncryptedData:', error);
      throw error;
    }
  }
}

export default PrivyService;