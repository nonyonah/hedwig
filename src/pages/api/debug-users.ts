import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get users with their wallet addresses and Telegram info
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        telegram_chat_id,
        telegram_username,
        telegram_first_name,
        telegram_last_name,
        created_at,
        wallets (
          address,
          chain,
          is_active
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Format the response for better readability
    const formattedUsers = users?.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      telegram: {
        chatId: user.telegram_chat_id,
        username: user.telegram_username,
        firstName: user.telegram_first_name,
        lastName: user.telegram_last_name,
        hasActiveTelegram: !!user.telegram_chat_id
      },
      wallets: user.wallets?.filter((w: any) => w.is_active).map((w: any) => ({
        address: w.address,
        chain: w.chain
      })) || [],
      createdAt: user.created_at
    }));

    return res.status(200).json({
      success: true,
      totalUsers: formattedUsers?.length || 0,
      usersWithTelegram: formattedUsers?.filter(u => u.telegram.hasActiveTelegram).length || 0,
      users: formattedUsers
    });

  } catch (error: any) {
    console.error('Debug users error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}