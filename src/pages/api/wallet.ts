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
import { getOrCreateWallet } from '@/lib/wallet';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Ensure Node.js runtime

type WalletResponse = {
  success: boolean;
  address?: string;
  message: string;
  error?: string;
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
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required',
      error: 'Missing userId'
    });
  }

  try {
    // In a real app, you might want to store and retrieve wallet information from your database
    // For now, we'll just return a success response with instructions
    return res.status(200).json({
      success: true,
      message: 'Wallet information retrieved',
      // Include any wallet information you want to return
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

    try {
      const result = await getOrCreateWallet(userId);
      const walletAddress = await result.provider.getAddress();
      
      return res.status(200).json({
        success: true,
        address: walletAddress,
        message: result.created ? 'Wallet created successfully' : 'Wallet accessed successfully'
      });
    } catch (error) {
      console.error('Wallet operation failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to access wallet',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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
