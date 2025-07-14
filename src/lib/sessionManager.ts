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
  sessionKeyPair?: SessionKeyPair;
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
      
      // Get user info from database
      const { data: wallet } = await supabase
        .from('wallets')
        .select('user_id, privy_user_id')
        .eq('address', walletAddress)
        .maybeSingle();
      
      if (!wallet?.privy_user_id) {
        console.log(`[SessionManager] No user found for wallet ${walletAddress}`);
        return null;
      }

      // Check if we have a cached session
      const cachedSession = this.sessionCache.get(walletAddress);
      if (cachedSession && this.isSessionValid(cachedSession)) {
        console.log(`[SessionManager] Valid cached session found for ${walletAddress}`);
        return cachedSession;
      }

      // Create new session info
      const sessionInfo: UserSessionInfo = {
        userId: wallet.user_id,
        privyUserId: wallet.privy_user_id,
        walletAddress,
        isActive: true,
        lastActivity: new Date(),
      };

      // Cache the session
      this.sessionCache.set(walletAddress, sessionInfo);
      
      console.log(`[SessionManager] Session validated for user ${wallet.privy_user_id}`);
      return sessionInfo;
    } catch (error) {
      console.error(`[SessionManager] Failed to validate session for ${walletAddress}:`, error);
      return null;
    }
  }

  /**
   * Refresh a user session with new ECDH P-256 keypair
   * Implements the complete flow recommended by Privy support
   */
  async refreshUserSession(walletAddress: string): Promise<boolean> {
    try {
      console.log(`[SessionManager] Refreshing session for wallet ${walletAddress}`);
      
      // Validate current session
      const sessionInfo = await this.validateUserSession(walletAddress);
      if (!sessionInfo) {
        console.error(`[SessionManager] Cannot refresh session - no valid user found for ${walletAddress}`);
        return false;
      }

      // Generate new session keypair
      const newKeyPair = await this.generateSessionKeyPair();
      
      // Update session info
      const updatedSession: UserSessionInfo = {
        ...sessionInfo,
        sessionKeyPair: newKeyPair,
        lastActivity: new Date(),
        isActive: true,
      };

      // Update cache
      this.sessionCache.set(walletAddress, updatedSession);
      
      console.log(`[SessionManager] Session refreshed successfully for ${walletAddress}`);
      return true;
    } catch (error) {
      console.error(`[SessionManager] Failed to refresh session for ${walletAddress}:`, error);
      return false;
    }
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