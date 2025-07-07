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
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract token from URL
    const { token } = req.query;
    
    if (!token || Array.isArray(token)) {
      return res.status(400).json({ 
        error: 'Invalid token', 
        details: 'A valid export token is required' 
      });
    }

    // Get export request details
    const exportRequest = await PrivyService.getExportRequest(token) as WalletExportRequest | null;
    
    if (!exportRequest) {
      return res.status(404).json({ 
        error: 'Export request not found', 
        details: 'The provided token is invalid or has expired' 
      });
    }

    // Check if request has expired
    if (new Date(exportRequest.expires_at) < new Date()) {
      return res.status(410).json({ 
        error: 'Export request expired', 
        details: 'This export request has expired. Please initiate a new export request.' 
      });
    }

    // If request is pending, initiate export from Privy
    if (exportRequest.status === 'pending') {
      try {
        // Call Privy API to export wallet
        const exportResult = await PrivyService.exportWalletFromPrivy(
          exportRequest.wallet_id,
          exportRequest.recipient_public_key
        );

        // Update export request with encrypted data
        await PrivyService.updateExportRequestWithEncryptedData(
          token,
          exportResult.encryptedPrivateKey,
          exportResult.encapsulation
        );

        // Update export request status
        await PrivyService.updateExportRequestStatus(token, 'ready');

        // Return success with status
        return res.status(200).json({ 
          status: 'ready',
          walletAddress: exportRequest.wallet_address
        });
      } catch (error) {
        const privyError = error as PrivyError;
        console.error('Error exporting wallet from Privy:', privyError);

        // Log Privy API error
        await supabase.from('errors').insert([
          {
            error_type: 'PRIVY_EXPORT_FAILED',
            error_message: privyError.message,
            stack_trace: privyError.stack,
            metadata: { token, walletId: exportRequest.wallet_id },
            user_id: null
          }
        ]);

        // Update export request status to failed
        await PrivyService.updateExportRequestStatus(token, 'failed');

        // Return error response
        return res.status(500).json({ 
          error: 'Failed to export wallet from Privy', 
          details: privyError.message 
        });
      }
    }

    // If request is already processed, return current status
    return res.status(200).json({ 
      status: exportRequest.status,
      walletAddress: exportRequest.wallet_address
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error retrieving export status:', error);

    // Log error
    try {
      await supabase.from('errors').insert([
        {
          error_type: 'WALLET_EXPORT_STATUS_FAILED',
          error_message: error.message,
          stack_trace: error.stack,
          metadata: { token: req.query.token },
          user_id: null
        }
      ]);
    } catch (logError) {
      console.error('Error logging to database:', logError);
    }

    // Return error response
    return res.status(500).json({ 
      error: 'Failed to retrieve export status', 
      details: error.message 
    });
  }
}