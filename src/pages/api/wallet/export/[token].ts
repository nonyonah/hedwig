// src/pages/api/wallet/export/[token].ts
import { NextApiRequest, NextApiResponse } from 'next';
import PrivyService from '../../../../lib/PrivyService';
import { createClient } from '@supabase/supabase-js';
import { WalletExportRequest, PrivyError } from '../../../../types/wallet';
import { loadServerEnvironment } from '../../../../lib/serverEnv';
import { privy } from '../../../../lib/privy';

// Ensure environment variables are loaded
loadServerEnvironment();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * API endpoint to check wallet export status and retrieve encrypted wallet data
 * 
 * Required path parameter:
 * - token: Export token from the initial request
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.query;

  if (!token || Array.isArray(token)) {
    return res.status(400).json({ 
      error: 'Invalid token', 
      details: 'A valid export token is required' 
    });
  }

  // GET request: Validate the token and return data for the client-side export page
  if (req.method === 'GET') {
    try {
      console.log(`[export][${token.substring(0, 8)}...] Validating export token`);
      
      const exportRequest = await PrivyService.getExportRequest(token) as WalletExportRequest | null;

      if (!exportRequest) {
        console.error(`[export][${token.substring(0, 8)}...] Export request not found`);
        return res.status(404).json({ 
          error: 'Export request not found', 
          details: 'The provided token is invalid or has expired.' 
        });
      }

      // Parse dates in UTC to avoid timezone issues
      const expiryDate = new Date(exportRequest.expires_at);
      const now = new Date();
      
      // Log both UTC and local times for debugging
      console.log(`[export][${token.substring(0, 8)}...] Token expiry (UTC): ${expiryDate.toISOString()}`);
      console.log(`[export][${token.substring(0, 8)}...] Current time (UTC): ${now.toISOString()}`);
      console.log(`[export][${token.substring(0, 8)}...] Time difference (ms): ${expiryDate.getTime() - now.getTime()}`);

      // Add a small buffer (5 minutes) to account for clock skew between servers
      const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      const effectiveExpiryTime = expiryDate.getTime() + bufferTime;
      
      if (now.getTime() > effectiveExpiryTime) {
        console.error(`[export][${token.substring(0, 8)}...] Token expired. Expired at: ${expiryDate.toISOString()}, Current time: ${now.toISOString()}`);
        return res.status(410).json({ 
          error: 'Export request expired', 
          details: 'This export link has expired. Please request a new one.' 
        });
      }

      // A link can only be used if it's in the 'pending' state.
      if (exportRequest.status !== 'pending') {
        console.error(`[export][${token.substring(0, 8)}...] Invalid status: ${exportRequest.status}`);
        return res.status(410).json({
          error: 'Export link invalid',
          details: 'This export link has already been used or is no longer valid. Please request a new one.',
        });
      }

      // Return the wallet address, which is needed for the client-side export call
      return res.status(200).json({
        status: 'pending',
        walletAddress: exportRequest.wallet_address,
      });

    } catch (error) {
      console.error('Error retrieving export request:', error);
      return res.status(500).json({ error: 'Failed to retrieve export request', details: (error as Error).message });
    }
  }

  // POST request: Mark the export as completed to prevent link reuse
  if (req.method === 'POST') {
    try {
      // Validate user authentication to prevent unauthorized completion
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`[export][${token.substring(0, 8)}...] Missing or invalid authorization header`);
        // Allow completion without auth for backward compatibility, but log the event
        console.log(`[export][${token.substring(0, 8)}...] Proceeding without authentication validation`);
      } else {
        try {
          const authToken = authHeader.substring(7); // Remove 'Bearer ' prefix
          const verifiedClaims = await privy.verifyAuthToken(authToken);
          console.log(`[export][${token.substring(0, 8)}...] Authenticated user: ${verifiedClaims.userId}`);
          
          // Verify the authenticated user matches the export request
          const exportRequest = await PrivyService.getExportRequest(token) as WalletExportRequest | null;
          if (exportRequest && exportRequest.privy_user_id !== verifiedClaims.userId) {
            console.error(`[export][${token.substring(0, 8)}...] User mismatch: ${verifiedClaims.userId} vs ${exportRequest.privy_user_id}`);
            return res.status(403).json({ 
              error: 'Unauthorized', 
              details: 'You are not authorized to complete this export request.' 
            });
          }
        } catch (authError) {
          console.error(`[export][${token.substring(0, 8)}...] Authentication validation failed:`, authError);
          return res.status(401).json({ 
            error: 'Authentication failed', 
            details: 'Invalid or expired authentication token.' 
          });
        }
      }
      
      const privyService = new PrivyService('system'); // privyUserId is not needed for this action
      await privyService.completeExportRequest(token);
      console.log(`[export][${token.substring(0, 8)}...] Export request completed successfully`);
      return res.status(200).json({ success: true, message: 'Export request marked as completed.' });
    } catch (error) {
      console.error('Error completing export request:', error);
      return res.status(500).json({ error: 'Failed to complete export request', details: (error as Error).message });
    }
  }

  // Handle other methods
  return res.status(405).json({ error: 'Method not allowed' });
}