// src/pages/api/wallet/export.ts
import { NextApiRequest, NextApiResponse } from 'next';
import PrivyService from '../../../lib/PrivyService';
import { createClient } from '@supabase/supabase-js';
import { exportWallet } from '../../../lib/whatsappTemplates';
import { WhatsAppError } from '../../../types/wallet';
import { toE164 } from '../../../lib/phoneFormat';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone, walletId, walletAddress, privyUserId } = req.body;

    if (!phone || !walletId || !walletAddress || !privyUserId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        details: 'phone, walletId, walletAddress, and privyUserId are required',
      });
    }

    // Use the phone number from the request for rate limiting and record-keeping.
    const phoneToUse = toE164(phone) || phone;

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        error: 'Invalid wallet address format',
        details: 'Wallet address must be a valid Ethereum address',
      });
    }

        const privyService = new PrivyService(privyUserId);

    // Check rate limit with the new return format
    const { isRateLimited, remainingAttempts } = await privyService.checkRateLimit(phoneToUse);
    if (isRateLimited) {
      return res.status(429).json({ 
        error: 'Too many requests',
        message: `You've exceeded the maximum number of export attempts. Please try again in an hour.`,
        retryAfter: 3600 // 1 hour in seconds
      });
    }

    // Create a pending export request to generate a secure token
    const { exportToken } = await privyService.createExportRequest(
      phoneToUse,
      walletId,
      walletAddress,
      '', // No longer storing HPKE keys here
      ''
    );

    // Construct the client-side export link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const exportLink = `${baseUrl}/wallet/export/${exportToken}`;
    console.log(`[export] Generated client-side export link: ${exportLink}`);

    // Send the link to the user via WhatsApp
    try {
      const { sendWhatsAppTemplate } = await import('../../../lib/whatsapp');
      let whatsappPhone = phoneToUse;
      if (whatsappPhone && !whatsappPhone.startsWith('+')) {
        whatsappPhone = '+' + whatsappPhone;
      }
      console.log(`[export] Sending WhatsApp template to ${whatsappPhone} with export_link: ${exportLink}`);
      const template = exportWallet({ export_link: exportLink });
      await sendWhatsAppTemplate(whatsappPhone, template);
    } catch (whatsappError) {
      console.error('Failed to send WhatsApp message, but export request was created:', whatsappError);
      // Proceed to return success, as the user can still be notified through other means if necessary
    }

    // Return a success response
    return res.status(200).json({
      success: true,
      message: 'Wallet export link has been sent to your WhatsApp.',
      exportToken,
      exportLink,
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error initiating wallet export:', error);
    return res.status(500).json({
      error: 'Failed to initiate wallet export',
      details: error.message,
    });
  }
}