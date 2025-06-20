import { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateCdpWallet, userHasWalletInDb, getWalletFromDb } from '@/lib/cdpWallet';

/**
 * User wallet API endpoint
 * Creates or retrieves a wallet for a specific user
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from request body
    const { username, phone, network = "base-sepolia" } = req.body;
    
    // Validate required parameters
    if (!username && !phone) {
      return res.status(400).json({ error: "Either 'username' or 'phone' is required" });
    }
    
    // Use phone as primary identifier if available, otherwise use username
    const userId = phone || username;
    
    console.log(`[User Wallet] Processing wallet request for user: ${userId}`);
    
    // Check if user already has a wallet
    const hasWallet = await userHasWalletInDb(userId, network);
    
    if (hasWallet) {
      // Get the existing wallet
      const wallet = await getWalletFromDb(userId, network);
      
      if (!wallet) {
        return res.status(500).json({ error: 'Wallet exists but could not be retrieved' });
      }
      
      console.log(`[User Wallet] Retrieved existing wallet for user ${userId}: ${wallet.address}`);
      
      return res.status(200).json({
        address: wallet.address,
        userId,
        network,
        created: false,
        message: 'Existing wallet retrieved successfully'
      });
    }
    
    // Create a new wallet
    console.log(`[User Wallet] Creating new wallet for user ${userId}`);
    const walletResult = await getOrCreateCdpWallet(userId, network);
    
    return res.status(201).json({
      address: walletResult.address,
      userId,
      network,
      created: walletResult.created,
      message: walletResult.created 
        ? 'New wallet created successfully' 
        : 'Existing wallet retrieved successfully'
    });
  } catch (error) {
    console.error('[User Wallet] Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error creating wallet' 
    });
  }
} 