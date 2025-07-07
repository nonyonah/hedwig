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

    const e164Phone = toE164(phone);
    if (!e164Phone) {
      return res.status(400).json({
        error: 'Invalid phone number format',
        details: 'Phone number must be a valid E.164 format phone number.',
      });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        error: 'Invalid wallet address format',
        details: 'Wallet address must be a valid Ethereum address',
      });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, privy_user_id')
      .eq('phone_number', e164Phone)
      .single();

    if (userError || !user) {
      console.error('Error fetching user for export:', userError);
      return res.status(404).json({ error: 'User not found for the provided phone number.' });
    }

    if (!user.privy_user_id) {
      return res.status(400).json({ error: 'User does not have a Privy account linked.' });
    }

    const privyService = new PrivyService(user.privy_user_id);

    const isRateLimited = await privyService.checkRateLimit(e164Phone);
    if (isRateLimited) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { publicKey, privateKey } = await privyService.generateHpkeKeyPair();

    const { exportToken } = await privyService.createExportRequest(
      e164Phone,
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

    try {
      const { sendWhatsAppTemplate } = await import('../../../lib/whatsapp');
      await sendWhatsAppTemplate(e164Phone, privateKeys({ export_link: exportLink }));
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
    }

    return res.status(200).json({
      success: true,
      message: 'Wallet export initiated successfully',
      exportToken,
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