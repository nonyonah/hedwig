// src/hooks/useSessionSigners.ts
import { usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to manage Privy session signers for KeyQuorum authorization
 * Session signers are managed server-side through the Privy API
 * This hook provides client-side utilities for checking session status
 */
export function useSessionSigners() {
  const { user, ready, authenticated, getAccessToken } = usePrivy();
  const [sessionStatus, setSessionStatus] = useState<'unknown' | 'active' | 'expired' | 'none'>('unknown');
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check session signer status via API
   */
  const checkSessionStatus = useCallback(async () => {
    if (!authenticated || !user) {
      setSessionStatus('none');
      return 'none';
    }

    setIsCheckingSession(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      
      // Call our API to check session signer status
      const response = await fetch('/api/session-signers/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to check session status: ${response.statusText}`);
      }

      const data = await response.json();
      const status = data.status || 'none';
      setSessionStatus(status);
      return status;
    } catch (err) {
      console.error('[useSessionSigners] Failed to check session status:', err);
      setError(err instanceof Error ? err.message : 'Failed to check session status');
      setSessionStatus('unknown');
      return 'unknown';
    } finally {
      setIsCheckingSession(false);
    }
  }, [authenticated, user, getAccessToken]);

  /**
   * Request session signer creation via API
   */
  const requestSessionSigner = useCallback(async () => {
    if (!authenticated || !user) {
      setError('User must be authenticated');
      return false;
    }

    setIsCheckingSession(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      
      // Call our API to create/refresh session signer
      const response = await fetch('/api/session-signers/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to create session signer: ${response.statusText}`);
      }

      const data = await response.json();
      setSessionStatus('active');
      return true;
    } catch (err) {
      console.error('[useSessionSigners] Failed to create session signer:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session signer');
      return false;
    } finally {
      setIsCheckingSession(false);
    }
  }, [authenticated, user, getAccessToken]);

  // Check session status on mount and when user changes
  useEffect(() => {
    if (ready && authenticated) {
      checkSessionStatus();
    }
  }, [ready, authenticated, checkSessionStatus]);

  return {
    sessionStatus,
    hasActiveSession: sessionStatus === 'active',
    isCheckingSession,
    error,
    checkSessionStatus,
    requestSessionSigner,
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