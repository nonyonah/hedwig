// src/hooks/useSessionSigners.ts
// This hook is deprecated as we've moved away from Privy to CDP
// Keeping for backward compatibility but functionality is disabled

import { useCallback, useEffect, useState } from 'react';

/**
 * Deprecated hook - previously managed Privy session signers
 * Now returns mock data since we've moved to CDP
 */
export function useSessionSigners() {
  const [sessionStatus, setSessionStatus] = useState<'unknown' | 'active' | 'expired' | 'none'>('none');
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Deprecated - returns mock status
   */
  const checkSessionStatus = useCallback(async () => {
    setSessionStatus('none');
    return 'none';
  }, []);

  /**
   * Deprecated - returns mock status
   */
  const createSessionSigner = useCallback(async () => {
    return { success: false, error: 'Session signers deprecated - using CDP instead' };
  }, []);

  /**
   * Deprecated - returns mock status
   */
  const revokeSessionSigner = useCallback(async () => {
    return { success: false, error: 'Session signers deprecated - using CDP instead' };
  }, []);

  return {
    sessionStatus,
    isCheckingSession,
    error,
    checkSessionStatus,
    createSessionSigner,
    revokeSessionSigner,
  };
}

/**
 * Utility function to check if a user has session signers
 * Can be used server-side or in API routes
 */
export function hasSessionSigners(user: any): boolean {
  return user?.wallet?.sessionSigners?.length > 0;
}