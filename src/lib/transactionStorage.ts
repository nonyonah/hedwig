import { supabase } from './supabase';

export interface PendingTransaction {
  transactionId: string;
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  tokenSymbol: string;
  tokenAddress?: string;
  network: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  transactionHash?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
}

class SupabaseTransactionStorage {
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Store a pending transaction in Supabase
   */
  async store(transactionId: string, transaction: Omit<PendingTransaction, 'transactionId' | 'createdAt' | 'expiresAt'>): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_MS);

    const pendingTransaction = {
      transaction_id: transactionId,
      user_id: transaction.userId,
      from_address: transaction.fromAddress,
      to_address: transaction.toAddress,
      amount: transaction.amount,
      token_symbol: transaction.tokenSymbol,
      token_address: transaction.tokenAddress,
      network: transaction.network,
      status: transaction.status,
      transaction_hash: transaction.transactionHash,
      error_message: transaction.errorMessage,
      metadata: transaction.metadata,
      expires_at: expiresAt.toISOString(),
    };

    const { error } = await supabase
      .from('pending_transactions')
      .insert(pendingTransaction);

    if (error) {
      console.error('[TransactionStorage] Error storing transaction:', error);
      throw new Error(`Failed to store transaction: ${error.message}`);
    }

    console.log(`[TransactionStorage] Stored transaction ${transactionId}, expires at ${expiresAt.toISOString()}`);
  }

  /**
   * Retrieve a pending transaction from Supabase
   */
  async get(transactionId: string): Promise<PendingTransaction | null> {
    const { data, error } = await supabase
      .from('pending_transactions')
      .select('*')
      .eq('transaction_id', transactionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      console.error('[TransactionStorage] Error retrieving transaction:', error);
      throw new Error(`Failed to retrieve transaction: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Check if transaction has expired
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    if (now > expiresAt) {
      // Transaction has expired, remove it and return null
      await this.remove(transactionId);
      return null;
    }

    return {
      transactionId: data.transaction_id,
      userId: data.user_id,
      fromAddress: data.from_address,
      toAddress: data.to_address,
      amount: data.amount,
      tokenSymbol: data.token_symbol,
      tokenAddress: data.token_address,
      network: data.network,
      status: data.status,
      transactionHash: data.transaction_hash,
      errorMessage: data.error_message,
      metadata: data.metadata,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
    };
  }

  /**
   * Update a pending transaction in Supabase
   */
  async update(transactionId: string, updates: Partial<Omit<PendingTransaction, 'transactionId' | 'createdAt' | 'expiresAt'>>): Promise<void> {
    const updateData: Record<string, any> = {};

    if (updates.userId !== undefined) updateData.user_id = updates.userId;
    if (updates.fromAddress !== undefined) updateData.from_address = updates.fromAddress;
    if (updates.toAddress !== undefined) updateData.to_address = updates.toAddress;
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.tokenSymbol !== undefined) updateData.token_symbol = updates.tokenSymbol;
    if (updates.tokenAddress !== undefined) updateData.token_address = updates.tokenAddress;
    if (updates.network !== undefined) updateData.network = updates.network;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.transactionHash !== undefined) updateData.transaction_hash = updates.transactionHash;
    if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    const { error } = await supabase
      .from('pending_transactions')
      .update(updateData)
      .eq('transaction_id', transactionId);

    if (error) {
      console.error('[TransactionStorage] Error updating transaction:', error);
      throw new Error(`Failed to update transaction: ${error.message}`);
    }
  }

  /**
   * Remove a pending transaction from Supabase
   */
  async remove(transactionId: string): Promise<void> {
    const { error } = await supabase
      .from('pending_transactions')
      .delete()
      .eq('transaction_id', transactionId);

    if (error) {
      console.error('[TransactionStorage] Error removing transaction:', error);
      throw new Error(`Failed to remove transaction: ${error.message}`);
    }

    console.log(`[TransactionStorage] Removed transaction ${transactionId}`);
  }

  /**
   * Clean up expired transactions from Supabase
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();

    const { data, error } = await supabase
      .from('pending_transactions')
      .delete()
      .lt('expires_at', now.toISOString())
      .select('transaction_id');

    if (error) {
      console.error('[TransactionStorage] Error cleaning up expired transactions:', error);
      throw new Error(`Failed to cleanup expired transactions: ${error.message}`);
    }

    const cleanedCount = data?.length || 0;
    if (cleanedCount > 0) {
      console.log(`[TransactionStorage] Cleaned up ${cleanedCount} expired transactions`);
    }

    return cleanedCount;
  }

  /**
   * Get the current number of pending transactions
   */
  async getSize(): Promise<number> {
    const { count, error } = await supabase
      .from('pending_transactions')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[TransactionStorage] Error getting transaction count:', error);
      throw new Error(`Failed to get transaction count: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Get all pending transactions for a user
   */
  async getByUserId(userId: string): Promise<PendingTransaction[]> {
    const { data, error } = await supabase
      .from('pending_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TransactionStorage] Error retrieving user transactions:', error);
      throw new Error(`Failed to retrieve user transactions: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    // Filter out expired transactions and clean them up
    const now = new Date();
    const validTransactions: PendingTransaction[] = [];
    const expiredIds: string[] = [];

    for (const row of data) {
      const expiresAt = new Date(row.expires_at);
      if (now > expiresAt) {
        expiredIds.push(row.transaction_id);
      } else {
        validTransactions.push({
          transactionId: row.transaction_id,
          userId: row.user_id,
          fromAddress: row.from_address,
          toAddress: row.to_address,
          amount: row.amount,
          tokenSymbol: row.token_symbol,
          tokenAddress: row.token_address,
          network: row.network,
          status: row.status,
          transactionHash: row.transaction_hash,
          errorMessage: row.error_message,
          metadata: row.metadata,
          createdAt: new Date(row.created_at),
          expiresAt: new Date(row.expires_at),
        });
      }
    }

    // Clean up expired transactions in the background
    if (expiredIds.length > 0) {
      Promise.all(expiredIds.map(id => this.remove(id))).catch(error => {
        console.error('[TransactionStorage] Error cleaning up expired transactions:', error);
      });
    }

    return validTransactions;
  }
}

// Create and export singleton instance
export const transactionStorage = new SupabaseTransactionStorage();

// Start cleanup interval (run every hour)
if (typeof window === 'undefined') {
  // Only run cleanup on server side
  setInterval(async () => {
    try {
      await transactionStorage.cleanupExpired();
    } catch (error) {
      console.error('[TransactionStorage] Cleanup interval error:', error);
    }
  }, 60 * 60 * 1000); // 1 hour
}