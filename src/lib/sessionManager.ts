import { generateECDHP256KeyPair } from './cryptoUtils';
import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface SessionKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  privateKeyBase64: string;
  publicKeyBase64: string;
  privateKeyPem: string;
  publicKeyPem: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface UserSessionInfo {
  userId: string;
  privyUserId: string;
  walletAddress: string;
  isActive: boolean;
  lastActivity: Date;
  createdAt: Date;
  isExpired: boolean;
  sessionKeyPair?: SessionKeyPair;
  encryptedAuthorizationKey?: string; // HPKE encrypted authorization key from Privy
  encapsulatedKey?: string; // HPKE ephemeral public key for decryption
  wallets?: any[]; // Wallets returned from Privy authentication
}

/**
 * Session Manager for Privy user signers
 * Implements Privy support recommendations for ECDH P-256 keypair generation
 * and active user session management
 */
export class SessionManager {
  private static instance: SessionManager;
  private sessionCache = new Map<string, UserSessionInfo>();
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Generate a new ECDH P-256 keypair for user session
   * Following Privy support recommendation
   */
  async generateSessionKeyPair(): Promise<SessionKeyPair> {
    try {
      console.log('[SessionManager] Generating new ECDH P-256 keypair for session');
      const keypair = await generateECDHP256KeyPair();
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.SESSION_DURATION);
      
      return {
        ...keypair,
        createdAt: now,
        expiresAt,
      };
    } catch (error) {
      console.error('[SessionManager] Failed to generate session keypair:', error);
      throw new Error(`Failed to generate session keypair: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate if a user has an active session
   * This addresses Privy support's recommendation to ensure active user sessions
   */
  async validateUserSession(walletAddress: string): Promise<UserSessionInfo | null> {
    try {
      console.log(`[SessionManager] Validating session for wallet ${walletAddress}`);
      
      // Get user info from database - using existing schema
      const { data: wallet } = await supabase
        .from('wallets')
        .select('user_id')
        .eq('address', walletAddress)
        .maybeSingle();
      
      if (!wallet?.user_id) {
        console.log(`[SessionManager] No user found for wallet ${walletAddress}`);
        return null;
      }

      // Get user details to construct privy user ID
      const { data: user } = await supabase
        .from('users')
        .select('id, phone_number')
        .eq('id', wallet.user_id)
        .maybeSingle();

      if (!user) {
        console.log(`[SessionManager] User details not found for wallet ${walletAddress}`);
        return null;
      }

      // Check if we have a cached session
      const cachedSession = this.sessionCache.get(walletAddress);
      if (cachedSession && this.isSessionValid(cachedSession)) {
        console.log(`[SessionManager] Valid cached session found for ${walletAddress}`);
        return cachedSession;
      }

      // Create new session info using user ID as privy user ID for now
      const now = new Date();
      const sessionInfo: UserSessionInfo = {
        userId: wallet.user_id,
        privyUserId: user.id, // Using user ID as fallback
        walletAddress,
        isActive: true,
        lastActivity: now,
        createdAt: now,
        isExpired: false,
      };

      // Cache the session
      this.sessionCache.set(walletAddress, sessionInfo);
      
      console.log(`[SessionManager] Session validated for user ${user.id} (phone: ${user.phone_number})`);
      return sessionInfo;
    } catch (error) {
      console.error(`[SessionManager] Failed to validate session for ${walletAddress}:`, error);
      return null;
    }
  }

  /**
   * Re-authenticate user signer by calling the authentication endpoint
   * This replaces the old session refresh logic as per Privy documentation
   * @param walletAddress - The wallet address to re-authenticate
   * @param authToken - User's JWT token for authentication
   * @returns Promise containing the re-authenticated session info
   */
  async reAuthenticateUserSigner(walletAddress: string, authToken: string): Promise<UserSessionInfo | null> {
    try {
      console.log(`[SessionManager] Re-authenticating user signer for wallet: ${walletAddress}`);
      
      const existingSession = this.sessionCache.get(walletAddress);
      if (!existingSession) {
        console.log(`[SessionManager] No existing session found for ${walletAddress}`);
        return null;
      }

      // Generate new ECDH P-256 keypair for re-authentication
      const newKeyPair = await this.generateSessionKeyPair();
      
      // Call the user signer authentication endpoint
      const authResponse = await fetch('/api/user-signers/authenticate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipient_public_key: newKeyPair.publicKeyBase64,
          wallet_address: walletAddress
        })
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error(`[SessionManager] User signer re-authentication failed:`, errorText);
        return null;
      }

      const authResult = await authResponse.json();
      const { authorization_key, encapsulated_key, wallets } = authResult;

      if (!authorization_key || !encapsulated_key) {
        console.error(`[SessionManager] Missing authorization key or encapsulated key in response`);
        return null;
      }

      // Update session with new authentication data
      const reAuthenticatedSession: UserSessionInfo = {
        ...existingSession,
        sessionKeyPair: newKeyPair,
        encryptedAuthorizationKey: authorization_key,
        encapsulatedKey: encapsulated_key,
        lastActivity: new Date(),
        isActive: true,
        wallets: wallets || []
      };

      // Update cache
      this.sessionCache.set(walletAddress, reAuthenticatedSession);
      
      console.log(`[SessionManager] User signer re-authenticated successfully for ${walletAddress}`);
      return reAuthenticatedSession;
      
    } catch (error) {
      console.error(`[SessionManager] Failed to re-authenticate user signer for ${walletAddress}:`, error);
      return null;
    }
  }

  /**
   * @deprecated Use reAuthenticateUserSigner instead
   * This method is deprecated as per Privy documentation for user signers
   */
  async refreshUserSession(walletAddress: string): Promise<boolean> {
    console.warn(`[SessionManager] refreshUserSession is deprecated. Use reAuthenticateUserSigner instead.`);
    return false;
  }

  /**
   * Check if a session is still valid
   */
  private isSessionValid(session: UserSessionInfo): boolean {
    if (!session.isActive) {
      return false;
    }

    // Check if session keypair exists and is not expired
    if (session.sessionKeyPair) {
      const now = new Date();
      if (now > session.sessionKeyPair.expiresAt) {
        console.log(`[SessionManager] Session keypair expired for ${session.walletAddress}`);
        return false;
      }
    }

    // Check last activity (sessions expire after 24 hours of inactivity)
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
    if (timeSinceLastActivity > this.SESSION_DURATION) {
      console.log(`[SessionManager] Session expired due to inactivity for ${session.walletAddress}`);
      return false;
    }

    return true;
  }

  /**
   * Clear expired sessions from cache
   */
  clearExpiredSessions(): void {
    console.log('[SessionManager] Clearing expired sessions');
    
    for (const [walletAddress, session] of this.sessionCache.entries()) {
      if (!this.isSessionValid(session)) {
        this.sessionCache.delete(walletAddress);
        console.log(`[SessionManager] Removed expired session for ${walletAddress}`);
      }
    }
  }

  /**
   * Get session info for a wallet address
   */
  getSessionInfo(walletAddress: string): UserSessionInfo | null {
    const session = this.sessionCache.get(walletAddress);
    return session && this.isSessionValid(session) ? session : null;
  }

  /**
   * Invalidate a session
   */
  invalidateSession(walletAddress: string): void {
    console.log(`[SessionManager] Invalidating session for ${walletAddress}`);
    this.sessionCache.delete(walletAddress);
  }
}

// Export singleton instance
export const sessionManager = SessionManager.getInstance();