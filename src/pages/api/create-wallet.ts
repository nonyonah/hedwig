import type { NextApiRequest, NextApiResponse } from 'next';
import { validatePhoneNumber } from '@/lib/whatsappUtils';
import { loadServerEnvironment } from '@/lib/serverEnv';
import { sendWhatsAppMessage } from '@/lib/whatsappUtils';
import { userHasWalletInDb, storeWalletInDb, getWalletFromDb } from '@/lib/walletDb';
import { getOrCreateWallet } from '@/lib/wallet';
import { registerUserWallet } from '@/lib/agentkit';
import { 
  shouldAllowWalletCreation, 
  recordWalletCreationAttempt, 
  walletPromptAlreadyShown, 
  markWalletPromptShown 
} from '@/pages/api/_walletUtils';

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

    // Check if wallet already exists in database
    const hasWalletInDb = await userHasWalletInDb(from);
    
    if (hasWalletInDb) {
      console.log(`[CREATE-WALLET] User ${from} already has a wallet`);
      
      // Get wallet from database
      const walletFromDb = await getWalletFromDb(from);
      if (walletFromDb) {
        const walletAddress = walletFromDb.address;
        console.log(`[CREATE-WALLET] Using wallet address from database: ${walletAddress}`);
        
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
      } else {
        console.warn(`[CREATE-WALLET] Wallet exists flag is true but no wallet found for user ${from}`);
        return res.status(500).json({
          success: false,
          message: 'Wallet exists but could not be retrieved',
        });
      }
    }

    // Check if we should allow wallet creation based on cooldown
    const canCreate = await shouldAllowWalletCreation(from);
    if (!canCreate) {
      console.log(`[CREATE-WALLET] Wallet creation currently rate-limited for user ${from}, but proceeding anyway`);
      // Temporarily bypass rate limiting - remove this comment when rate limiting is fixed
      // Try to proceed with wallet creation despite rate limit
      /*
      try {
        await sendWhatsAppMessage(from, 'Please wait a few minutes before trying to create another wallet.');
        return res.status(429).json({
          success: false,
          message: 'Wallet creation rate limited',
        });
      } catch (sendError) {
        console.error('[CREATE-WALLET] Error sending rate limit message:', sendError);
        return res.status(429).json({
          success: false,
          message: 'Wallet creation rate limited',
        });
      }
      */
    }

    // Record the creation attempt
    try {
      await recordWalletCreationAttempt(from);
    } catch (recordError) {
      console.error('[CREATE-WALLET] Error recording wallet creation attempt:', recordError);
      // Continue with wallet creation even if recording fails
    }

    // Create a new wallet
    console.log(`[CREATE-WALLET] Creating new wallet for user ${from}`);
    
    try {
      // Create a new wallet
      const { provider, created } = await getOrCreateWallet(from);
      
      // Verify the wallet was created by getting its address
      const address = await provider.getAddress();
      console.log(`[CREATE-WALLET] Wallet ${created ? 'created' : 'retrieved'} for user ${from} with address ${address}`);
      
      // Register this wallet with AgentKit for persistence
      await registerUserWallet(from, provider);
      console.log(`[CREATE-WALLET] Registered wallet with AgentKit for user ${from}`);
      
      // Send the wallet creation success message
      try {
        await sendWhatsAppMessage(from, `✅ Wallet ${created ? 'Created' : 'Ready'}! Your wallet address is: ${address}`);
        
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
          message: `Wallet ${created ? 'created' : 'retrieved'} and messages sent`,
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