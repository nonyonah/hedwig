import { NextApiRequest, NextApiResponse } from 'next';
import { sendWhatsAppMessage } from '@/lib/whatsappUtils';

/**
 * API endpoint to handle wallet import flow submissions
 * 
 * This receives data from WhatsApp Flows when a user completes the wallet import process
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('Received wallet import flow submission:', JSON.stringify(req.body));
    
    // Extract data from the flow submission
    const { flowToken, fieldValues } = req.body;
    
    // Extract private key from field values
    const privateKey = fieldValues.private_key;
    const phoneNumber = fieldValues.phone_number;
    const username = fieldValues.username;
    
    if (!privateKey || !phoneNumber) {
      console.error('Missing required fields in flow submission');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate private key format
    if (!privateKey.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
      console.error('Invalid private key format');
      await sendWhatsAppMessage(
        phoneNumber, 
        "❌ The private key you provided is in an invalid format. Please make sure it's a valid Ethereum private key."
      );
      return res.status(400).json({ error: 'Invalid private key format' });
    }
    
    try {
      // Derive address from private key
      const { ethers } = await import('ethers');
      const wallet = new ethers.Wallet(privateKey);
      const address = wallet.address;
      
      console.log(`Derived wallet address ${address} for user ${phoneNumber}`);
      
      // Call your existing import wallet function
      const { getOrCreateWallet } = await import('@/lib/cdpWallet');
      const result = await getOrCreateWallet(phoneNumber, username, address);
      
      if (result && result.address) {
        // Send success message
        await sendWhatsAppMessage(
          phoneNumber, 
          `✅ *Wallet Imported Successfully*\n\nYour wallet has been imported!\n\nAddress: \`${address}\`\n\nYou can now use commands like /wallet balance to interact with your wallet.`
        );
        
        console.log(`Successfully imported wallet for user ${phoneNumber}`);
        return res.status(200).json({ success: true, address });
      } else {
        throw new Error('Failed to import wallet');
      }
    } catch (error) {
      console.error('Error importing wallet:', error);
      
      // Send error message
      await sendWhatsAppMessage(
        phoneNumber, 
        "❌ We encountered an error importing your wallet. Please try again later or contact support."
      );
      
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error during wallet import'
      });
    }
  } catch (error) {
    console.error('Error in wallet import flow handler:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 