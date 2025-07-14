// src/lib/privyClientManager.ts
import { PrivyClient } from '@privy-io/server-auth';
import { decryptHPKEAuthorizationKey } from './cryptoUtils';
import { sessionManager } from './sessionManager';
import { loadServerEnvironment } from './serverEnv';

// Load environment variables
loadServerEnvironment();

/**
 * Manager for creating and managing PrivyClient instances with user signer authorization
 * This handles the decryption of HPKE encrypted authorization keys from user signer authentication
 */
export class PrivyClientManager {
  private static instance: PrivyClientManager;
  private clientCache = new Map<string, { client: PrivyClient; createdAt: Date }>();
  private readonly cacheTimeout = 30 * 60 * 1000; // 30 minutes

  private constructor() {}

  static getInstance(): PrivyClientManager {
    if (!PrivyClientManager.instance) {
      PrivyClientManager.instance = new PrivyClientManager();
    }
    return PrivyClientManager.instance;
  }

  /**
   * Get a PrivyClient instance with user signer authorization
   * @param walletAddress - The wallet address to get the client for
   * @returns Promise containing the configured PrivyClient
   */
  async getClientForWallet(walletAddress: string): Promise<PrivyClient | null> {
    try {
      // Check cache first
      const cached = this.clientCache.get(walletAddress);
      if (cached && (Date.now() - cached.createdAt.getTime()) < this.cacheTimeout) {
        console.log(`[PrivyClientManager] Using cached client for ${walletAddress}`);
        return cached.client;
      }

      // Get session info
      const sessionInfo = await sessionManager.validateUserSession(walletAddress);
      if (!sessionInfo) {
        console.error(`[PrivyClientManager] No valid session found for ${walletAddress}`);
        return null;
      }

      // Check if we have the required keys for decryption
      if (!sessionInfo.encryptedAuthorizationKey || !sessionInfo.encapsulatedKey || !sessionInfo.sessionKeyPair) {
        console.error(`[PrivyClientManager] Missing required keys for HPKE decryption`);
        return null;
      }

      // Decrypt the authorization key using HPKE
      const decryptedAuthKey = await decryptHPKEAuthorizationKey(
        sessionInfo.encryptedAuthorizationKey,
        sessionInfo.encapsulatedKey,
        sessionInfo.sessionKeyPair.privateKeyBase64
      );

      // Create PrivyClient with the decrypted authorization key
      const client = new PrivyClient(
        process.env.PRIVY_APP_ID!,
        process.env.PRIVY_APP_SECRET!,
        {
          walletApi: {
            authorizationPrivateKey: decryptedAuthKey
          }
        }
      );

      // Cache the client
      this.clientCache.set(walletAddress, {
        client,
        createdAt: new Date()
      });

      console.log(`[PrivyClientManager] Created new PrivyClient for ${walletAddress}`);
      return client;

    } catch (error) {
      console.error(`[PrivyClientManager] Failed to create client for ${walletAddress}:`, error);
      return null;
    }
  }

  /**
   * Get a basic PrivyClient without user signer authorization
   * This is useful for operations that don't require wallet access
   */
  getBasicClient(): PrivyClient {
    return new PrivyClient(
      process.env.PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    );
  }

  /**
   * Clear the client cache for a specific wallet
   * @param walletAddress - The wallet address to clear from cache
   */
  clearCache(walletAddress?: string): void {
    if (walletAddress) {
      this.clientCache.delete(walletAddress);
      console.log(`[PrivyClientManager] Cleared cache for ${walletAddress}`);
    } else {
      this.clientCache.clear();
      console.log(`[PrivyClientManager] Cleared all client cache`);
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [walletAddress, cached] of this.clientCache.entries()) {
      if ((now - cached.createdAt.getTime()) >= this.cacheTimeout) {
        this.clientCache.delete(walletAddress);
        console.log(`[PrivyClientManager] Removed expired cache entry for ${walletAddress}`);
      }
    }
  }
}

// Export singleton instance
export const privyClientManager = PrivyClientManager.getInstance();

// Set up periodic cache cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    privyClientManager.cleanupCache();
  }, 10 * 60 * 1000); // Clean up every 10 minutes
}