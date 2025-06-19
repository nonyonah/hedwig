// --- BEGIN: Runtime and Crypto Debugging (MUST BE FIRST) ---
console.log('[Wallet API] process.versions:', typeof process !== 'undefined' ? process.versions : 'undefined');
console.log('[Wallet API] process.release:', typeof process !== 'undefined' ? process.release : 'undefined');
console.log('[Wallet API] typeof globalThis.crypto BEFORE polyfill:', typeof globalThis.crypto);

if (typeof globalThis.crypto === 'undefined') {
  try {
    // @ts-ignore
    globalThis.crypto = require('crypto').webcrypto;
    console.log('[Wallet API] Polyfilled globalThis.crypto with Node.js crypto.webcrypto');
  } catch (e) {
    console.error('[Wallet API] Failed to polyfill globalThis.crypto:', e);
  }
}
console.log('[Wallet API] typeof globalThis.crypto AFTER polyfill:', typeof globalThis.crypto);
// --- END: Runtime and Crypto Debugging ---

import type { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateWallet, getWalletBalances } from '@/lib/wallet';
import { loadServerEnvironment } from '@/lib/serverEnv';
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/whatsappUtils';
import { createWalletDetailsTemplate, createWalletImportTemplate, createSendCryptoTemplate, createReceiveCryptoTemplate } from '@/lib/whatsappTemplates';
import { formatTokenBalance } from '@/lib/utils';

// Ensure environment variables are loaded
loadServerEnvironment();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Ensure Node.js runtime

type WalletResponse = {
  success: boolean;
  address?: string;
  message: string;
  error?: string;
  balances?: any;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<WalletResponse>) {
  // Handle different HTTP methods
  if (req.method === 'GET') {
    await handleGetRequest(req, res);
  } else if (req.method === 'POST') {
    await handlePostRequest(req, res);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed`,
      error: 'Invalid HTTP method'
    });
  }
}

// Handle GET requests
async function handleGetRequest(req: NextApiRequest, res: NextApiResponse<WalletResponse>) {
  const userId = req.query.userId as string;
  const action = req.query.action as string;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required',
      error: 'Missing userId'
    });
  }

  try {
    // Get wallet balances
    const balances = await getWalletBalances(userId);
    
    if (!balances) {
      return res.status(404).json({
        success: false,
        message: 'No wallet found for this user',
        error: 'Wallet not found'
      });
    }
    
    // If a WhatsApp phone number is provided, send the wallet details as a template
    const phone = req.query.phone as string;
    if (phone) {
      try {
        // Create and send wallet details template with buttons
        const template = createWalletDetailsTemplate(
          balances.address,
          balances.network,
          balances.nativeBalance,
          balances.tokens
        );
        
        await sendWhatsAppTemplate(phone, template);
        
        // Handle specific actions
        if (action === 'send') {
          const sendTemplate = createSendCryptoTemplate(balances.address);
          await sendWhatsAppTemplate(phone, sendTemplate);
        } else if (action === 'receive') {
          const receiveTemplate = createReceiveCryptoTemplate(balances.address);
          await sendWhatsAppTemplate(phone, receiveTemplate);
        } else if (action === 'import') {
          const importTemplate = createWalletImportTemplate();
          await sendWhatsAppTemplate(phone, importTemplate);
        }
      } catch (sendError) {
        console.error('Error sending wallet template:', sendError);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Wallet information retrieved',
      address: balances.address,
      balances: {
        network: balances.network,
        nativeBalance: balances.nativeBalance,
        tokens: balances.tokens
      }
    });
  } catch (error) {
    console.error('Failed to get wallet info:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet information',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Handle POST requests
async function handlePostRequest(req: NextApiRequest, res: NextApiResponse<WalletResponse>) {
  try {
    const { userId, action } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
        error: 'Missing userId'
      });
    }

    // Handle different actions
    if (action === 'import') {
      // Import wallet functionality would go here
      // This is a placeholder for future implementation
      return res.status(501).json({
        success: false,
        message: 'Wallet import not yet implemented',
        error: 'Not implemented'
      });
    } else {
      // Default: Get or create wallet
      try {
        const result = await getOrCreateWallet(userId);
        const walletAddress = await result.provider.getAddress();
        
        // Get balances if wallet was successfully created or accessed
        let balances = null;
        try {
          balances = await getWalletBalances(userId);
        } catch (balanceError) {
          console.error('Error getting wallet balances:', balanceError);
        }
        
        return res.status(200).json({
          success: true,
          address: walletAddress,
          message: result.created ? 'Wallet created successfully' : 'Wallet accessed successfully',
          balances: balances ? {
            network: balances.network,
            nativeBalance: balances.nativeBalance,
            tokens: balances.tokens
          } : undefined
        });
      } catch (error) {
        console.error('Wallet operation failed:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to access wallet',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  } catch (error) {
    console.error('Request processing failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
