import { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateWallet, userHasWalletInDb, getWalletFromDb } from '@/lib/cdpWallet';

/**
 * User wallet API endpoint
 * Creates, retrieves, or imports a wallet for a specific user
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from request body
    const { username, phone, importAddress, network = "base-sepolia" } = req.body;
    
    // Validate required parameters
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    // Use phone as primary identifier
    const userId = phone;
    
    console.log(`[User Wallet] Processing wallet request for user: ${userId}${username ? ` (${username})` : ''}`);
    
    // Check if user already has a wallet
    const hasWallet = await userHasWalletInDb(userId);
    
    if (hasWallet) {
      // Get the existing wallet
      const wallet = await getWalletFromDb(userId);
      
      if (!wallet) {
        return res.status(500).json({ error: 'Wallet exists but could not be retrieved' });
      }
      
      console.log(`[User Wallet] Retrieved existing wallet for user ${userId}: ${wallet.address}`);
      
      return res.status(200).json({
        address: wallet.address,
        userId,
        username: wallet.username || username,
        network,
        created: false,
        imported: wallet.imported || false,
        message: 'Existing wallet retrieved successfully'
      });
    }
    
    // If importing a wallet
    if (importAddress) {
      if (!importAddress.startsWith('0x') || importAddress.length !== 42) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
      }
      
      console.log(`[User Wallet] Importing wallet address ${importAddress} for user ${userId}`);
      
      try {
        // Import the wallet
        const walletResult = await getOrCreateWallet(userId, username, importAddress);
        
        return res.status(201).json({
          address: walletResult.address,
          userId,
          username,
          network,
          created: true,
          imported: true,
          message: 'Wallet imported successfully'
        });
      } catch (importError) {
        console.error('[User Wallet] Error importing wallet:', importError);
        return res.status(500).json({ 
          error: importError instanceof Error ? importError.message : 'Unknown error importing wallet' 
        });
      }
    }
    
    // Create a new wallet
    console.log(`[User Wallet] Creating new wallet for user ${userId}${username ? ` (${username})` : ''}`);
    
    try {
      const walletResult = await getOrCreateWallet(userId, username);
      
      return res.status(201).json({
        address: walletResult.address,
        userId,
        username,
        network,
        created: walletResult.created,
        imported: false,
        message: walletResult.created 
          ? 'New wallet created successfully' 
          : 'Existing wallet retrieved successfully'
      });
    } catch (walletError) {
      console.error('[User Wallet] Error creating wallet:', walletError);
      return res.status(500).json({ 
        error: walletError instanceof Error ? walletError.message : 'Unknown error creating wallet',
        success: false,
        message: 'Failed to create wallet. Please try again later.'
      });
    }
  } catch (error) {
    console.error('[User Wallet] Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error creating wallet' 
    });
  }
} 