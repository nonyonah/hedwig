// src/pages/api/wallet/export.ts
import { NextApiRequest, NextApiResponse } from 'next';
import PrivyService from '../../../lib/PrivyService';
import { createClient } from '@supabase/supabase-js';
import { privateKeys } from '../../../lib/whatsappTemplates';
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
    const { phone, walletId, walletAddress } = req.body;

    if (!phone || !walletId || !walletAddress) {
      return res.status(400).json({
        error: 'Missing required parameters',
        details: 'phone, walletId, and walletAddress are required',
      });
    }

    // Try to convert to E.164 format, but use original as fallback
    let phoneToUse = phone;
    const e164Phone = toE164(phone);
    
    if (e164Phone) {
      phoneToUse = e164Phone;
      console.log(`[wallet/export] Converted phone ${phone} to E.164 format: ${e164Phone}`);
    } else {
      console.log(`[wallet/export] Could not convert phone to E.164, using original: ${phoneToUse}`);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        error: 'Invalid wallet address format',
        details: 'Wallet address must be a valid Ethereum address',
      });
    }

    // Try to find user by phone number
    console.log(`[wallet/export] Looking up user with phone: ${phoneToUse}`);
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('id, privy_user_id, phone_number')
      .eq('phone_number', phoneToUse)
      .single();
      
    // If not found and we have an E.164 format, try that as well
    if ((!user || userError) && e164Phone && e164Phone !== phoneToUse) {
      console.log(`[wallet/export] User not found with ${phoneToUse}, trying E.164 format: ${e164Phone}`);
      const result = await supabase
        .from('users')
        .select('id, privy_user_id, phone_number')
        .eq('phone_number', e164Phone)
        .single();
        
      user = result.data;
      userError = result.error;
    }

    if (userError || !user) {
      console.error('Error fetching user for export:', userError);
      return res.status(404).json({ error: 'User not found for the provided phone number.' });
    }

    if (!user.privy_user_id) {
      return res.status(400).json({ error: 'User does not have a Privy account linked.' });
    }

    const privyService = new PrivyService(user.privy_user_id);

    const isRateLimited = await privyService.checkRateLimit(phoneToUse);
    if (isRateLimited) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { publicKey, privateKey } = await privyService.generateHpkeKeyPair();

    const { exportToken } = await privyService.createExportRequest(
      phoneToUse,
      walletId,
      walletAddress,
      publicKey,
      privateKey
    );

    privyService
      .exportWalletFromPrivy(walletId, publicKey)
      .then(async ({ encryptedPrivateKey, encapsulation }: { encryptedPrivateKey: string; encapsulation: string }) => {
        await privyService.updateExportRequestWithEncryptedData(exportToken, encryptedPrivateKey, encapsulation);
        await privyService.updateExportRequestStatus(exportToken, 'ready');
      })
      .catch(async (error: any) => {
        console.error('Error exporting wallet from Privy:', error);
        await privyService.updateExportRequestStatus(exportToken, 'failed');
      });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    let exportLink = `${baseUrl}/wallet/export/${exportToken}`;

    if (exportLink.length > 50) {
      const tokenPart = `/wallet/export/${exportToken}`;
      const truncatedBaseUrl = baseUrl.substring(0, Math.max(0, 50 - tokenPart.length - 3)) + '...';
      exportLink = `${truncatedBaseUrl}${tokenPart}`;
    }
    
    console.log(`[export] Generated export link: ${exportLink}`);

    try {
      const { sendWhatsAppTemplate } = await import('../../../lib/whatsapp');
      const { privateKeys } = await import('../../../lib/whatsappTemplates');
      
      // Make sure export_link is a non-empty string
      if (!exportLink) {
        exportLink = `${baseUrl}/wallet/export/${exportToken}`;
      }
      
      // Format the phone number for WhatsApp
      let whatsappPhone = user.phone_number;
      
      // Ensure phone starts with '+' for WhatsApp API
      if (whatsappPhone && !whatsappPhone.startsWith('+')) {
        whatsappPhone = '+' + whatsappPhone;
      }
      
      console.log(`[export] Sending WhatsApp template to ${whatsappPhone} with export_link: ${exportLink}`);
      const template = privateKeys({ export_link: exportLink });
      console.log('[export] Template payload:', JSON.stringify(template));
      
      await sendWhatsAppTemplate(whatsappPhone, template);
    } catch (whatsappError) {
      console.error('Failed to send WhatsApp message, but export will continue:', whatsappError);
      // Do not rethrow; allow the API to return a success response
    }

    return res.status(200).json({
      success: true,
      message: 'Wallet export initiated successfully',
      exportToken,
      exportLink, // Include the export link in the response
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