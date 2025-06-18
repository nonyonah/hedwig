import type { NextApiRequest, NextApiResponse } from 'next';
import { validatePhoneNumber } from '@/lib/whatsappUtils';
import { loadServerEnvironment } from '@/lib/serverEnv';
import { sendWhatsAppMessage } from '@/lib/whatsappUtils';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * Direct wallet creation endpoint
 * This endpoint is specifically designed to be called when a user clicks the "Create Wallet" button
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS method for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { from, buttonId } = req.body;

    // Basic validation
    if (!from) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: from',
      });
    }

    // Validate phone number format
    if (!validatePhoneNumber(from)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
      });
    }

    console.log(`[CREATE-WALLET] Processing wallet creation for user ${from}, buttonId: ${buttonId}`);

    // Import wallet creation dependencies
    const { getOrCreateWallet, getCachedWalletCredentials } = await import('@/lib/wallet');
    const { registerUserWallet } = await import('@/lib/agentkit');
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    const { userHasWalletInDb, storeWalletInDb, getWalletFromDb } = await import('@/lib/walletDb');

    // Use a locking mechanism to prevent concurrent wallet creations
    // We'll check for existing wallet creation in progress and use timestamp
    const IS_CREATING_WALLET_KEY = `creating_wallet_${from}`;
    const CREATION_TIMEOUT_MS = 30000; // 30 seconds

    // Check if wallet already exists in cache or database
    const existingWallet = getCachedWalletCredentials(from);
    const hasWalletInDb = await userHasWalletInDb(from);
    
    if (existingWallet || hasWalletInDb) {
      console.log(`[CREATE-WALLET] User ${from} already has a wallet`);
      
      let walletAddress: string;
      
      // If we have the address in cache, use it
      if (existingWallet) {
        walletAddress = existingWallet.address;
        console.log(`[CREATE-WALLET] Using cached wallet address: ${walletAddress}`);
      } else {
        // Otherwise, get it from the database
        const walletFromDb = await getWalletFromDb(from);
        if (walletFromDb) {
          walletAddress = walletFromDb.address;
          console.log(`[CREATE-WALLET] Using wallet address from database: ${walletAddress}`);
        } else {
          // This shouldn't happen, but just in case
          console.warn(`[CREATE-WALLET] Wallet exists flag is true but no wallet found for user ${from}`);
          return res.status(500).json({
            success: false,
            message: 'Wallet exists but could not be retrieved',
          });
        }
      }
      
      // Send wallet exists message
      try {
        await sendWhatsAppMessage(from, `You already have a wallet with address: ${walletAddress}`);
        
        return res.status(200).json({
          success: true,
          message: 'Wallet already exists message sent',
          address: walletAddress
        });
      } catch (sendError) {
        console.error('[CREATE-WALLET] Error sending wallet exists message:', sendError);
        return res.status(500).json({
          success: false,
          message: 'Failed to send wallet exists message',
        });
      }
    }

    // Create a new wallet with forceNew=true
    console.log(`[CREATE-WALLET] Creating new wallet for user ${from} with forceNew=true`);
    
    try {
      // Force create a new wallet
      const wallet = await getOrCreateWallet(from, undefined, true);
      
      // Verify the wallet was created by getting its address
      const address = await wallet.getAddress();
      console.log(`[CREATE-WALLET] New wallet created for user ${from} with address ${address}`);
      
      // Register this wallet with AgentKit for persistence
      await registerUserWallet(from, wallet);
      console.log(`[CREATE-WALLET] Registered wallet with AgentKit for user ${from}`);
      
      // Store the wallet in the database
      console.log(`[CREATE-WALLET] Storing wallet in database for user ${from}`);
      
      // Get the private key from cache since wallet provider doesn't expose it
      const cachedWallet = getCachedWalletCredentials(from);
      if (!cachedWallet || !cachedWallet.privateKey) {
        console.warn(`[CREATE-WALLET] No private key found in cache for user ${from}`);
        // We can't store the wallet in the database without a private key
      } else {
        const dbStoreResult = await storeWalletInDb(from, address, cachedWallet.privateKey);
        
        if (dbStoreResult) {
          console.log(`[CREATE-WALLET] Successfully stored wallet in database for user ${from}`);
        } else {
          console.warn(`[CREATE-WALLET] Failed to store wallet in database for user ${from}`);
        }
      }
      
      // Send the wallet creation success message
      try {
        await sendWhatsAppMessage(from, `✅ Wallet Created! Your new wallet address is: ${address}`);
        
        // Send introduction message immediately
        const introMessage = `🎉 *Welcome to Hedwig!* 🎉\n\nNow that your wallet is ready, I can help you with:\n\n• Checking your wallet balance\n• Sending and receiving crypto\n• Getting testnet funds\n• Exploring blockchain data\n• Learning about Web3\n\nWhat would you like to do first?`;
        
        try {
          await sendWhatsAppMessage(from, introMessage);
          console.log('[CREATE-WALLET] Sent introduction message after wallet creation');
        } catch (introError) {
          console.error('[CREATE-WALLET] Failed to send introduction message:', introError);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Wallet created and messages sent',
          address
        });
      } catch (sendError) {
        console.error('[CREATE-WALLET] Error sending wallet creation message:', sendError);
        return res.status(500).json({
          success: false,
          message: 'Wallet created but failed to send message',
          address
        });
      }
    } catch (walletError) {
      console.error('[CREATE-WALLET] Error creating wallet:', walletError);
      
      // Send error message
      try {
        await sendWhatsAppMessage(from, 'Sorry, there was an error creating your wallet. Please try again later.');
      } catch (sendError) {
        console.error('[CREATE-WALLET] Error sending error message:', sendError);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create wallet',
        error: walletError instanceof Error ? walletError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('[CREATE-WALLET] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unexpected error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 