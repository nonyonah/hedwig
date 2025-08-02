import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletId, newName, nameType } = req.body;

    if (!walletId || !newName || !nameType) {
      return res.status(400).json({ 
        error: 'Missing required fields: walletId, newName, nameType' 
      });
    }

    // Validate nameType
    if (!['telegram_username', 'email', 'custom'].includes(nameType)) {
      return res.status(400).json({ 
        error: 'Invalid nameType. Must be telegram_username, email, or custom' 
      });
    }

    // Validate email format if nameType is email
    if (nameType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newName)) {
        return res.status(400).json({ 
          error: 'Invalid email format' 
        });
      }
    }

    // Validate Telegram username format if nameType is telegram_username
    if (nameType === 'telegram_username') {
      const telegramRegex = /^[a-zA-Z0-9_]{5,32}$/;
      if (!telegramRegex.test(newName.replace('@', ''))) {
        return res.status(400).json({ 
          error: 'Invalid Telegram username format' 
        });
      }
    }

    // Update the wallet name in the database
    const { data, error } = await supabase
      .from('wallets')
      .update({ 
        username: newName,
        display_name_type: nameType,
        updated_at: new Date().toISOString()
      })
      .eq('id', walletId)
      .select();

    if (error) {
      console.error('[update-wallet-name] Database error:', error);
      return res.status(500).json({ 
        error: 'Failed to update wallet name' 
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: 'Wallet not found' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Wallet name updated successfully',
      wallet: data[0]
    });

  } catch (error) {
    console.error('[update-wallet-name] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
}