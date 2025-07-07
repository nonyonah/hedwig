// Feature disabled: Private key export is currently unavailable.
// import { NextApiRequest, NextApiResponse } from 'next';
// import crypto from 'crypto';

// HPKE configuration as per Privy documentation
const HPKE_CONFIG = {
  KEM: 'DHKEM_P256_HKDF_SHA256',
  KDF: 'HKDF_SHA256',
  AEAD: 'CHACHA20_POLY1305',
  MODE: 'BASE'
};

interface ExportWalletRequest {
  walletId: string;
  userId: string;
}

interface PrivyExportResponse {
  encryption_type: string;
  ciphertext: string;
  encapsulated_key: string;
}

export default function handler(req, res) {
  res.status(503).json({ message: 'Private key export is currently unavailable.' });
  // if (req.method !== 'POST') {
  //   return res.status(405).json({ error: 'Method not allowed' });
  // }
  // try {
    const { walletId, userId }: ExportWalletRequest = req.body;

    if (!walletId || !userId) {
      return res.status(400).json({ error: 'Missing walletId or userId' });
    }

    // Generate HPKE key pair for encryption
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'der'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der'
      }
    });

    const recipientPublicKey = Buffer.from(publicKey).toString('base64');

    // Call Privy's export API
    const privyResponse = await fetch(`https://api.privy.io/v1/wallets/${walletId}/export`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'privy-app-id': process.env.PRIVY_APP_ID!,
        'privy-authorization-signature': await generateAuthSignature(walletId, userId)
      },
      body: JSON.stringify({
        encryption_type: 'HPKE',
        recipient_public_key: recipientPublicKey
      })
    });

    if (!privyResponse.ok) {
      const error = await privyResponse.text();
      console.error('Privy API error:', error);
      return res.status(privyResponse.status).json({ error: 'Failed to export wallet from Privy' });
    }

    const exportData: PrivyExportResponse = await privyResponse.json();

    // Return the encrypted data along with our private key for client-side decryption
    // Note: In production, you might want to handle decryption server-side for better security
    res.status(200).json({
      ...exportData,
      recipientPrivateKey: Buffer.from(privateKey).toString('base64')
    });

  } catch (error) {
    console.error('Export wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Generate authorization signature for Privy API
async function generateAuthSignature(walletId: string, userId: string): Promise<string> {
  // This should implement the proper signature generation as per Privy's documentation
  // For now, returning a placeholder - you'll need to implement this based on your auth setup
  const timestamp = Date.now();
  const message = `${walletId}:${userId}:${timestamp}`;
  
  // Use your app's private key to sign the message
  const signature = crypto
    .createHmac('sha256', process.env.PRIVY_APP_SECRET!)
    .update(message)
    .digest('hex');
    
  return `${timestamp}:${signature}`;
}