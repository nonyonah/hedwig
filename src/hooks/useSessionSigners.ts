// src/hooks/useSessionSigners.ts
import { usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to manage Privy session signers for KeyQuorum authorization
 * This enables server-side transaction signing with proper delegation
 */
export function useSessionSigners() {
  const { user, ready, authenticated, addSessionSigner } = usePrivy();
  const [hasSessionSigners, setHasSessionSigners] = useState(false);
  const [isAddingSessionSigner, setIsAddingSessionSigner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has session signers
  useEffect(() => {
    if (ready && authenticated && user?.wallet) {
      // Check if session signers exist
      const sessionSigners = user.wallet.sessionSigners || [];
      setHasSessionSigners(sessionSigners.length > 0);
    } else {
      setHasSessionSigners(false);
    }
  }, [ready, authenticated, user]);

  /**
   * Add a session signer to enable server-side transaction signing
   * This is required for KeyQuorum authorization to work
   */
  const addSessionSignerForKeyQuorum = useCallback(async () => {
    if (!authenticated || !user?.wallet) {
      setError('User must be authenticated with a wallet');
      return false;
    }

    if (hasSessionSigners) {
      console.log('[useSessionSigners] Session signers already exist');
      return true;
    }

    setIsAddingSessionSigner(true);
    setError(null);

    try {
      console.log('[useSessionSigners] Adding session signer for KeyQuorum...');
      
      // Add session signer with appropriate permissions
      await addSessionSigner({
        // Allow the session signer to sign transactions
        permissions: ['eth_sendTransaction'],
        // Set expiration (optional, defaults to 1 hour)
        expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });

      console.log('[useSessionSigners] Session signer added successfully');
      setHasSessionSigners(true);
      return true;
    } catch (err) {
      console.error('[useSessionSigners] Failed to add session signer:', err);
      setError(err instanceof Error ? err.message : 'Failed to add session signer');
      return false;
    } finally {
      setIsAddingSessionSigner(false);
    }
  }, [authenticated, user, hasSessionSigners, addSessionSigner]);

  /**
   * Ensure session signers are available for KeyQuorum
   * Call this before making server-side transactions
   */
  const ensureSessionSigners = useCallback(async () => {
    if (hasSessionSigners) {
      return true;
    }
    return await addSessionSignerForKeyQuorum();
  }, [hasSessionSigners, addSessionSignerForKeyQuorum]);

  return {
    hasSessionSigners,
    isAddingSessionSigner,
    error,
    addSessionSignerForKeyQuorum,
    ensureSessionSigners,
    ready: ready && authenticated,
  };
}

/**
 * Utility function to check if a user has session signers
 * Can be used server-side or in API routes
 */
export function hasSessionSigners(user: any): boolean {
  return user?.wallet?.sessionSigners?.length > 0;
}