// src/pages/api/wallet/complete/[token].ts
import { NextApiRequest, NextApiResponse } from 'next';
import PrivyService from '../../../../lib/PrivyService';
import { createClient } from '@supabase/supabase-js';
import { sendFailed } from '../../../../lib/whatsappTemplates';
import { WalletExportRequest, WhatsAppError, DecryptionError } from '../../../../types/wallet';
import { loadServerEnvironment } from '../../../../lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * API endpoint to complete wallet export and retrieve private key
 * 
 * Required path parameter:
 * - token: Export token from the initial request
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
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

    // Check if request is in the correct state
    if (exportRequest.status !== 'ready') {
      return res.status(400).json({ 
        error: 'Export request not ready', 
        details: `Current status: ${exportRequest.status}. The export request must be in 'ready' state.` 
      });
    }

    // Check if encrypted data is available
    if (!exportRequest.encrypted_private_key || !exportRequest.encapsulation) {
      return res.status(500).json({ 
        error: 'Missing encrypted data', 
        details: 'The export request does not contain encrypted wallet data' 
      });
    }

    try {
      // Decrypt private key using HPKE
      const privateKey = await PrivyService.decryptPrivateKey(
        exportRequest.encrypted_private_key,
        exportRequest.encapsulation,
        exportRequest.recipient_private_key
      );

      // Update export request status to completed
      await PrivyService.completeExportRequest(token);

      // Send WhatsApp confirmation message
      try {
        // Import WhatsApp messaging function
        const { sendWhatsAppTemplate } = await import('../../../../lib/whatsapp');
        
        // Send success message using text template since there's no specific template for this
        await sendWhatsAppTemplate(exportRequest.user_phone, {
          name: 'private_keys_success',
          language: { code: 'en' },
          components: [
            {
              type: 'BODY',
              parameters: [
                { type: 'text', text: exportRequest.wallet_address }
              ]
            }
          ]
        });

        // Log successful message sending
        await supabase.from('message_logs').insert([
          {
            user_id: exportRequest.user_phone,
            message_type: 'template',
            content: 'private_keys_success',
            direction: 'outgoing',
            metadata: { walletAddress: exportRequest.wallet_address }
          }
        ]);
      } catch (error) {
        const whatsappError = error as WhatsAppError;
        console.error('Error sending WhatsApp confirmation:', whatsappError);
        
        // Log WhatsApp error but continue with the process
        await supabase.from('errors').insert([
          {
            error_type: 'WHATSAPP_SEND_FAILED',
            error_message: whatsappError.message,
            metadata: { phone: exportRequest.user_phone, token },
            user_id: null
          }
        ]);
      }

      // Return decrypted private key
      // IMPORTANT: This is the only place where the decrypted private key is returned
      // It is never stored in the database or logged
      return res.status(200).json({ 
        success: true, 
        privateKey,
        walletAddress: exportRequest.wallet_address
      });
    } catch (error) {
      const decryptionError = error as DecryptionError;
      console.error('Error decrypting private key:', decryptionError);

      // Log decryption error
      await supabase.from('errors').insert([
        {
          error_type: 'DECRYPTION_FAILED',
          error_message: decryptionError.message,
          stack_trace: decryptionError.stack,
          metadata: { token },
          user_id: null
        }
      ]);

      // Update export request status to failed
      await PrivyService.updateExportRequestStatus(token, 'failed');

      // Try to send error message via WhatsApp
      try {
        // Import WhatsApp messaging function
        const { sendWhatsAppTemplate } = await import('../../../../lib/whatsapp');
        
        // Send error message using the sendFailed template
        await sendWhatsAppTemplate(exportRequest.user_phone, sendFailed({
          reason: 'Failed to decrypt your wallet. Please try again.'
        }));
      } catch (error) {
        const whatsappError = error as WhatsAppError;
        console.error('Error sending WhatsApp error message:', whatsappError);
      }

      // Return error response
      return res.status(500).json({ 
        error: 'Failed to decrypt private key', 
        details: decryptionError.message 
      });
    }
  } catch (err) {
    const error = err as Error;
    console.error('Error completing wallet export:', error);

    // Log error
    try {
      await supabase.from('errors').insert([
        {
          error_type: 'WALLET_EXPORT_COMPLETE_FAILED',
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
      error: 'Failed to complete wallet export', 
      details: error.message 
    });
  }
}