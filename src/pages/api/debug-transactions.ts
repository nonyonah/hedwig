import { NextApiRequest, NextApiResponse } from 'next';
import { transactionStorage } from '../../lib/transactionStorage';
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
    // Get transaction counts by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('pending_transactions')
      .select('status')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        
        const counts = data?.reduce((acc: Record<string, number>, row: any) => {
          acc[row.status] = (acc[row.status] || 0) + 1;
          return acc;
        }, {}) || {};
        
        return { data: counts, error: null };
      });

    if (statusError) {
      throw statusError;
    }

    // Get total counts
    const pendingCount = await transactionStorage.getSize();
    
    // Get completed transactions count
    const { count: completedCount, error: completedError } = await supabase
      .from('completed_transactions')
      .select('*', { count: 'exact', head: true });

    if (completedError) {
      throw completedError;
    }

    // Get recent transactions (last 10)
    const { data: recentTransactions, error: recentError } = await supabase
      .from('pending_transactions')
      .select('transaction_id, user_id, status, created_at, expires_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      throw recentError;
    }

    // Get old transactions (older than 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: oldTransactions, error: oldError } = await supabase
      .from('pending_transactions')
      .select('transaction_id, status, created_at')
      .lt('created_at', twentyFourHoursAgo);

    if (oldError) {
      throw oldError;
    }

    return res.status(200).json({
      success: true,
      summary: {
        totalPending: pendingCount,
        totalCompleted: completedCount || 0,
        statusBreakdown: statusCounts,
        oldTransactions: oldTransactions?.length || 0
      },
      recentTransactions: recentTransactions || [],
      oldTransactions: oldTransactions || [],
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[DebugTransactions] Error:', error);
    return res.status(500).json({
      error: 'Failed to get transaction status',
      message: error.message
    });
  }
}