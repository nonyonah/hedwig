import { NextApiRequest, NextApiResponse } from 'next';
import { offrampService } from '../../../services/offrampService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { method } = req;

  switch (method) {
    case 'GET':
      return handleGetTransactions(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Get transaction status or transaction history
 */
async function handleGetTransactions(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { userId, transactionId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If transactionId is provided, get specific transaction
    if (transactionId && typeof transactionId === 'string') {
      const transaction = await offrampService.checkTransactionStatus(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Verify transaction belongs to user
      if (transaction.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.status(200).json({
        success: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          token: transaction.token,
          fiatAmount: transaction.fiatAmount,
          fiatCurrency: transaction.fiatCurrency,
          bankDetails: transaction.bankDetails,
          status: transaction.status,
          txHash: transaction.txHash,
          payoutId: transaction.payoutId,
          errorMessage: transaction.errorMessage,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt
        }
      });
    }

    // Get transaction history for user
    const transactions = await offrampService.getTransactionHistory(userId);

    res.status(200).json({
      success: true,
      transactions: transactions.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        token: tx.token,
        fiatAmount: tx.fiatAmount,
        fiatCurrency: tx.fiatCurrency,
        bankDetails: tx.bankDetails,
        status: tx.status,
        txHash: tx.txHash,
        payoutId: tx.payoutId,
        errorMessage: tx.errorMessage,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt
      })),
      count: transactions.length
    });
  } catch (error: any) {
    console.error('[API] Transactions error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}