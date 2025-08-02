import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, chain } = req.query;

    let query = supabase
      .from('wallets')
      .select(`
        id,
        user_id,
        address,
        cdp_wallet_id,
        chain,
        username,
        display_name_type,
        created_at,
        updated_at,
        users(
          id,
          telegram_username,
          email,
          telegram_chat_id
        )
      `)
      .order('created_at', { ascending: false });

    // Filter by user if provided
    if (userId) {
      query = query.eq('user_id', userId);
    }

    // Filter by chain if provided
    if (chain) {
      query = query.eq('chain', chain);
    }

    const { data: wallets, error } = await query;

    if (error) {
      console.error('[list-wallets] Database error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch wallets' 
      });
    }

    // Format the response to include suggested names
    const formattedWallets = wallets?.map(wallet => {
      const user = Array.isArray(wallet.users) ? wallet.users[0] : wallet.users;
      const suggestedNames = {
        telegram_username: user?.telegram_username ? `@${user.telegram_username}` : null,
        email: user?.email || null,
        chat_id: user?.telegram_chat_id ? `Chat_${user.telegram_chat_id}` : null
      };

      return {
        id: wallet.id,
        user_id: wallet.user_id,
        address: wallet.address,
        cdp_wallet_id: wallet.cdp_wallet_id,
        chain: wallet.chain,
        current_name: wallet.username,
        display_name_type: wallet.display_name_type,
        suggested_names: suggestedNames,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at,
        user: {
          telegram_username: user?.telegram_username,
          email: user?.email,
          telegram_chat_id: user?.telegram_chat_id
        }
      };
    }) || [];

    return res.status(200).json({
      success: true,
      wallets: formattedWallets,
      total: formattedWallets.length
    });

  } catch (error) {
    console.error('[list-wallets] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
}