// src/pages/api/wallet/export.ts
import { NextApiRequest, NextApiResponse } from 'next';
import PrivyService from '../../../lib/PrivyService';
import { createClient } from '@supabase/supabase-js';
import { privateKeys } from '../../../lib/whatsappTemplates';
import { WhatsAppError } from '../../../types/wallet';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * API endpoint to initiate wallet export process
 * 
 * Required body parameters:
 * - phone: User's phone number
 * - walletId: Privy wallet ID to export
 * - walletAddress: Wallet address
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract request parameters
    const { phone, walletId, walletAddress } = req.body;

    // Validate required parameters
    if (!phone || !walletId || !walletAddress) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        details: 'phone, walletId, and walletAddress are required' 
      });
    }

    // Validate phone number format (basic validation)
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      return res.status(400).json({ 
        error: 'Invalid phone number format', 
        details: 'Phone number must be in E.164 format (e.g., +1234567890)' 
      });
    }

    // Validate wallet address format (basic Ethereum address validation)
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ 
        error: 'Invalid wallet address format', 
        details: 'Wallet address must be a valid Ethereum address' 
      });
    }

    // Check rate limits
    const isRateLimited = await PrivyService.checkRateLimit(phone);
    if (isRateLimited) {
      // Log rate limit exceeded
      await supabase.from('errors').insert([
        {
          error_type: 'RATE_LIMIT_EXCEEDED',
          error_message: 'Wallet export rate limit exceeded',
          metadata: { phone, walletId, walletAddress },
          user_id: null
        }
      ]);

      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        details: 'You can only export your wallet 3 times per hour' 
      });
    }

    // Generate HPKE key pair for secure export
    const { publicKey, privateKey } = await PrivyService.generateHpkeKeyPair();

    // Create export request in database
    const { exportToken } = await PrivyService.createExportRequest(
      phone,
      walletId,
      walletAddress,
      publicKey,
      privateKey
    );

    // Generate export link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.example.com';
    let exportLink = `${baseUrl}/wallet/export/${exportToken}`;
    
    // Truncate the link if it's too long (keeping the token intact)
    if (exportLink.length > 50) {
      const tokenPart = `/wallet/export/${exportToken}`;
      const truncatedBaseUrl = baseUrl.substring(0, Math.max(0, 50 - tokenPart.length - 3)) + '...';
      exportLink = `${truncatedBaseUrl}${tokenPart}`;
    }

    // Send WhatsApp message with export link
    try {
      // Import WhatsApp messaging function
      const { sendWhatsAppTemplate } = await import('../../../lib/whatsapp');
      
      // Send template message using the official private_keys template
      await sendWhatsAppTemplate(phone, privateKeys({
        export_link: exportLink
      }));

      // Log successful message sending
      await supabase.from('message_logs').insert([
        {
          user_id: phone,
          message_type: 'template',
          content: 'private_keys',
          direction: 'outgoing',
          metadata: { walletAddress, exportToken }
        }
      ]);
    } catch (error) {
      const whatsappError = error as WhatsAppError;
      console.error('Error sending WhatsApp message:', whatsappError);
      
      // Log WhatsApp error
      await supabase.from('errors').insert([
        {
          error_type: 'WHATSAPP_SEND_FAILED',
          error_message: whatsappError.message,
          metadata: { phone, walletId, walletAddress, exportToken },
          user_id: null
        }
      ]);

      // Continue with the process even if WhatsApp message fails
      // The user can still use the export token if we return it
    }

    // Return success with export token (but not the link for security)
    return res.status(200).json({ 
      success: true, 
      message: 'Wallet export initiated successfully',
      exportToken
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error initiating wallet export:', error);

    // Log error
    try {
      await supabase.from('errors').insert([
        {
          error_type: 'WALLET_EXPORT_INIT_FAILED',
          error_message: error.message,
          stack_trace: error.stack,
          metadata: req.body,
          user_id: null
        }
      ]);
    } catch (logError) {
      console.error('Error logging to database:', logError);
    }

    // Return error response
    return res.status(500).json({ 
      error: 'Failed to initiate wallet export', 
      details: error.message 
    });
  }
}