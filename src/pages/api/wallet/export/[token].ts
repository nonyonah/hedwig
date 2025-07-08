// src/pages/api/wallet/export/[token].ts
import { NextApiRequest, NextApiResponse } from 'next';
import PrivyService from '../../../../lib/PrivyService';
import { createClient } from '@supabase/supabase-js';
import { WalletExportRequest, PrivyError } from '../../../../types/wallet';

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
      const exportRequest = await PrivyService.getExportRequest(token) as WalletExportRequest | null;

      if (!exportRequest) {
        return res.status(404).json({ 
          error: 'Export request not found', 
          details: 'The provided token is invalid or has expired.' 
        });
      }

      if (new Date(exportRequest.expires_at) < new Date()) {
        return res.status(410).json({ 
          error: 'Export request expired', 
          details: 'This export link has expired. Please request a new one.' 
        });
      }

      // A link can only be used if it's in the 'pending' state.
      if (exportRequest.status !== 'pending') {
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
      const privyService = new PrivyService('system'); // privyUserId is not needed for this action
      await privyService.completeExportRequest(token);
      return res.status(200).json({ success: true, message: 'Export request marked as completed.' });
    } catch (error) {
      console.error('Error completing export request:', error);
      return res.status(500).json({ error: 'Failed to complete export request', details: (error as Error).message });
    }
  }

  // Handle other methods
  return res.status(405).json({ error: 'Method not allowed' });
}