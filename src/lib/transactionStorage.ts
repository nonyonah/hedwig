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
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (unused, kept for compatibility)

  private normalizeNetwork(network: string): string {
    const n = (network || '').trim().toLowerCase();
    switch (n) {
      case 'base':
      case 'solana':
      case 'celo':
      case 'lisk':
      case 'arbitrum':
        return n;
    }
    // Common aliases
    if (n === 'eth' || n === 'ethereum' || n === 'base-mainnet') return 'base';
    if (n === 'sol' || n === 'solana-mainnet') return 'solana';
    if (n === 'celo-mainnet') return 'celo';
    if (n.startsWith('lisk')) return 'lisk';
    if (n === 'arb' || n === 'arbitrum-one') return 'arbitrum';
    return n;
  }

  /**
   * Store a pending transaction in Supabase
   */
  async store(transactionId: string, transaction: Omit<PendingTransaction, 'transactionId' | 'createdAt' | 'expiresAt'>): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_MS); // 24 hours from now
    
    const pendingTransaction = {
      transaction_id: transactionId,
      user_id: transaction.userId,
      from_address: transaction.fromAddress,
      to_address: transaction.toAddress,
      amount: transaction.amount,
      token_symbol: transaction.tokenSymbol,
      token_address: transaction.tokenAddress,
      network: this.normalizeNetwork(transaction.network),
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

    console.log(`[TransactionStorage] Stored transaction ${transactionId}`);
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

    return {
      transactionId: data.transaction_id,
      userId: data.user_id,
      fromAddress: data.from_address,
      toAddress: data.to_address,
      amount: data.amount,
      tokenSymbol: data.token_symbol,
      tokenAddress: data.token_address,
      network: this.normalizeNetwork(data.network),
      status: data.status,
      transactionHash: data.transaction_hash,
      errorMessage: data.error_message,
      metadata: data.metadata,
      createdAt: data.created_at ? new Date(data.created_at) : new Date(),
      expiresAt: data.expires_at ? new Date(data.expires_at) : (data.created_at ? new Date(data.created_at) : new Date()),
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
    if (updates.network !== undefined) updateData.network = this.normalizeNetwork(updates.network);
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

    // If transaction is completed, move it to permanent storage and remove from pending
    if (updates.status === 'completed') {
      await this.moveToCompletedTransactions(transactionId);
    }
  }

  /**
   * Move completed transaction to permanent storage
   */
  private async moveToCompletedTransactions(transactionId: string): Promise<void> {
    try {
      // Get the transaction data first
      const { data: transactionData, error: fetchError } = await supabase
        .from('pending_transactions')
        .select('*')
        .eq('transaction_id', transactionId)
        .single();

      if (fetchError || !transactionData) {
        console.error('[TransactionStorage] Error fetching transaction for permanent storage:', fetchError);
        return;
      }

      // Insert into completed_transactions table (permanent storage)
      const completedTransaction = {
        transaction_id: transactionData.transaction_id,
        user_id: transactionData.user_id,
        from_address: transactionData.from_address,
        to_address: transactionData.to_address,
        amount: transactionData.amount,
        token_symbol: transactionData.token_symbol,
        token_address: transactionData.token_address,
        network: transactionData.network,
        status: transactionData.status,
        transaction_hash: transactionData.transaction_hash,
        error_message: transactionData.error_message,
        metadata: transactionData.metadata,
        completed_at: new Date().toISOString(),
        created_at: transactionData.created_at
      };

      const { error: insertError } = await supabase
        .from('completed_transactions')
        .insert(completedTransaction);

      if (insertError) {
        console.error('[TransactionStorage] Error storing completed transaction:', insertError);
        return;
      }

      // Remove from pending_transactions table
      await this.remove(transactionId);
      
      console.log(`[TransactionStorage] Moved completed transaction ${transactionId} to permanent storage`);
    } catch (error) {
      console.error('[TransactionStorage] Error moving transaction to permanent storage:', error);
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
   * Clean up expired and failed transactions from Supabase
   * Note: Completed transactions are moved to permanent storage, not deleted
   */
  async cleanupExpired(): Promise<number> {
    try {
      // First, clean up failed and expired transactions
      const { data: failedData, error: failedError } = await supabase
        .from('pending_transactions')
        .delete()
        .in('status', ['failed', 'expired'])
        .select('transaction_id');

      let cleanedCount = 0;

      if (failedError) {
        console.error('[TransactionStorage] Error cleaning up failed/expired transactions:', {
          message: failedError.message,
          details: failedError.details,
          hint: failedError.hint,
          code: failedError.code
        });
      } else {
        cleanedCount += failedData?.length || 0;
      }

      // Also clean up transactions that are older than 24 hours regardless of status
      // (except completed ones which should have been moved to permanent storage)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: expiredData, error: expiredError } = await supabase
        .from('pending_transactions')
        .delete()
        .lt('created_at', twentyFourHoursAgo)
        .neq('status', 'completed')
        .select('transaction_id');

      if (expiredError) {
        console.error('[TransactionStorage] Error cleaning up old transactions:', {
          message: expiredError.message,
          details: expiredError.details,
          hint: expiredError.hint,
          code: expiredError.code
        });
      } else {
        cleanedCount += expiredData?.length || 0;
      }

      if (cleanedCount > 0) {
        console.log(`[TransactionStorage] Cleaned up ${cleanedCount} transactions`);
      }

      return cleanedCount;
    } catch (error: any) {
      console.error('[TransactionStorage] Unexpected error during cleanup:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      // Don't throw here to prevent the cleanup interval from stopping
      return 0;
    }
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
   * Get all pending transactions for a user (excludes completed transactions)
   */
  async getByUserId(userId: string): Promise<PendingTransaction[]> {
    const { data, error } = await supabase
      .from('pending_transactions')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'completed') // Exclude completed transactions as they're moved to permanent storage
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TransactionStorage] Error retrieving user transactions:', error);
      throw new Error(`Failed to retrieve user transactions: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    const transactions: PendingTransaction[] = data.map((row: any) => ({
      transactionId: row.transaction_id,
      userId: row.user_id,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      amount: row.amount,
      tokenSymbol: row.token_symbol,
      tokenAddress: row.token_address,
      network: this.normalizeNetwork(row.network),
      status: row.status,
      transactionHash: row.transaction_hash,
      errorMessage: row.error_message,
      metadata: row.metadata,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      expiresAt: row.expires_at ? new Date(row.expires_at) : (row.created_at ? new Date(row.created_at) : new Date()),
    }));

    return transactions;
  }

  /**
   * Get completed transactions for a user from permanent storage
   */
  async getCompletedTransactionsByUserId(userId: string): Promise<PendingTransaction[]> {
    const { data, error } = await supabase
      .from('completed_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false });

    if (error) {
      console.error('[TransactionStorage] Error retrieving completed transactions:', error);
      throw new Error(`Failed to retrieve completed transactions: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return data.map(row => ({
      transactionId: row.transaction_id,
      userId: row.user_id,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      amount: row.amount,
      tokenSymbol: row.token_symbol,
      tokenAddress: row.token_address,
      network: this.normalizeNetwork(row.network),
      status: row.status,
      transactionHash: row.transaction_hash,
      errorMessage: row.error_message,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.completed_at), // Use completed_at as expiresAt for consistency
    }));
  }
}

// Create and export singleton instance
export const transactionStorage = new SupabaseTransactionStorage();

// Start cleanup interval (run every hour)
if (typeof window === 'undefined') {
  // Only run cleanup on server side
  let cleanupRunning = false;
  
  const runCleanup = async () => {
    if (cleanupRunning) {
      console.log('[TransactionStorage] Cleanup already running, skipping...');
      return;
    }
    
    cleanupRunning = true;
    try {
      console.log('[TransactionStorage] Starting scheduled cleanup...');
      const cleanedCount = await transactionStorage.cleanupExpired();
      console.log(`[TransactionStorage] Scheduled cleanup completed, cleaned ${cleanedCount} transactions`);
    } catch (error: any) {
      console.error('[TransactionStorage] Cleanup interval error:', {
        message: error.message,
        stack: error.stack
      });
    } finally {
      cleanupRunning = false;
    }
  };
  
  // Run initial cleanup after 30 seconds
  setTimeout(runCleanup, 30 * 1000);
  
  // Then run every hour
  setInterval(runCleanup, 60 * 60 * 1000); // 1 hour
}