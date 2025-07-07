// Feature disabled: Private key export is currently unavailable.
// import { NextApiRequest, NextApiResponse } from 'next';
// import crypto from 'crypto';
// import { PrivyClient } from '@privy-io/server-auth';

interface ExportWalletRequest {
  walletId: string;
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
    const { walletId }: ExportWalletRequest = req.body;

    if (!walletId) {
      return res.status(400).json({ error: 'Missing walletId' });
    }

    // Initialize Privy client
    const privy = new PrivyClient(
      process.env.PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    );

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

    // Call Privy's export API directly using the server SDK
    const exportResponse = await fetch(`https://api.privy.io/v1/wallets/${walletId}/export`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'privy-app-id': process.env.PRIVY_APP_ID!
      },
      body: JSON.stringify({
        encryption_type: 'HPKE',
        recipient_public_key: recipientPublicKey
      })
    });

    if (!exportResponse.ok) {
      const errorText = await exportResponse.text();
      console.error('Privy API error:', errorText);
      return res.status(exportResponse.status).json({ 
        error: 'Failed to export wallet from Privy',
        details: errorText
      });
    }

    const exportData: PrivyExportResponse = await exportResponse.json();

    // Return the encrypted data along with our private key for client-side decryption
    res.status(200).json({
      ...exportData,
      recipientPrivateKey: Buffer.from(privateKey).toString('base64')
    });

  } catch (error) {
    console.error('Export wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}