import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface OfframpSession {
  id: string;
  userId: string;
  step: 'amount' | 'payout_method' | 'bank_selection' | 'account_number' | 'confirmation' | 'final_confirmation' | 'processing' | 'completed' | 'creating_order' | 'awaiting_transfer' | 'transferring_tokens' | 'transfer_completed';
  data: {
    amount?: number;
    token?: string;
    payoutMethod?: string;
    bankName?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
    exchangeRate?: number;
    fiatAmount?: number;
    netAmount?: number;
    transactionId?: string;
    transactionHash?: string;
    orderId?: string;
    receiveAddress?: string;
    expectedAmount?: string;
    status?: string;
    lastStatusCheck?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export class OfframpSessionService {
  private static readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  /**
   * Create a new offramp session for a user
   */
  async createSession(userId: string): Promise<OfframpSession> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OfframpSessionService.SESSION_TIMEOUT);
    
    // Clear any existing active sessions for this user to prevent multiple sessions
    console.log(`[OfframpSession] Clearing existing sessions for user: ${userId}`);
    await supabase
      .from('offramp_sessions')
      .delete()
      .eq('user_id', userId)
      .gt('expires_at', now.toISOString());
    
    const sessionData = {
      user_id: userId,
      step: 'amount',
      data: {},
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    const { data, error } = await supabase
      .from('offramp_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create offramp session: ${error.message}`);
    }

    console.log(`[OfframpSession] Created new session: ${data.id} for user: ${userId}`);
    return this.mapDbToSession(data);
  }

  /**
   * Get active session for a user
   */
  async getActiveSession(userId: string): Promise<OfframpSession | null> {
    const { data, error } = await supabase
      .from('offramp_sessions')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDbToSession(data);
  }

  /**
   * Update session step and data
   */
  async updateSession(
    sessionId: string, 
    step: OfframpSession['step'], 
    data: Partial<OfframpSession['data']>
  ): Promise<OfframpSession> {
    const now = new Date();
    
    console.log(`[OfframpSession] Updating session: ${sessionId} to step: ${step}`);
    
    // Validate sessionId is provided
    if (!sessionId || sessionId.trim() === '') {
      throw new Error('Session ID is required for update');
    }
    
    // Get current session data and validate it exists
    const { data: currentData, error: fetchError } = await supabase
      .from('offramp_sessions')
      .select('data, user_id, expires_at')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      console.error(`[OfframpSession] Error fetching session ${sessionId}:`, fetchError);
      if (fetchError.code === 'PGRST116') {
        throw new Error(`Session not found: ${sessionId}`);
      }
      throw new Error(`Failed to fetch session: ${fetchError.message}`);
    }

    // Check if session is still valid (not expired)
    if (new Date(currentData.expires_at) <= now) {
      throw new Error(`Session expired: ${sessionId}`);
    }

    // Merge current data with new data
    const mergedData = { ...currentData.data, ...data };

    // First check how many rows would be affected
    const { count: affectedCount } = await supabase
      .from('offramp_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('id', sessionId);

    console.log(`[OfframpSession] Sessions found with ID ${sessionId}: ${affectedCount}`);
    
    if (affectedCount === 0) {
      throw new Error(`No session found with ID: ${sessionId}`);
    }
    
    if (affectedCount && affectedCount > 1) {
      console.error(`[OfframpSession] Multiple sessions found with same ID: ${sessionId}, count: ${affectedCount}`);
      throw new Error(`Multiple sessions found with ID: ${sessionId}`);
    }

    const { data: updatedData, error } = await supabase
      .from('offramp_sessions')
      .update({
        step,
        data: mergedData,
        updated_at: now.toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error(`Session update failed - multiple or no rows affected for session: ${sessionId}`);
      }
      throw new Error(`Failed to update session: ${error.message}`);
    }

    if (!updatedData) {
      throw new Error(`Session update returned no data for session: ${sessionId}`);
    }

    console.log(`[OfframpSession] Successfully updated session: ${sessionId}`);
    return this.mapDbToSession(updatedData);
  }

  /**
   * Get session by ID with validation
   */
  async getSessionById(sessionId: string): Promise<OfframpSession | null> {
    const { data, error } = await supabase
      .from('offramp_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Session not found
      }
      throw new Error(`Failed to fetch session: ${error.message}`);
    }

    // Check if session is still valid (not expired)
    if (new Date(data.expires_at) <= new Date()) {
      return null; // Session expired
    }

    return this.mapDbToSession(data);
  }

  /**
   * Clear/delete session
   */
  async clearSession(sessionId: string): Promise<void> {
    console.log(`[OfframpSession] Clearing session: ${sessionId}`);
    
    const { error, count } = await supabase
      .from('offramp_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to clear session: ${error.message}`);
    }

    console.log(`[OfframpSession] Successfully cleared session: ${sessionId}`);
  }

  /**
   * Clear expired sessions (cleanup job)
   */
  async clearExpiredSessions(): Promise<void> {
    const { error } = await supabase
      .from('offramp_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('Failed to clear expired sessions:', error);
    }
  }

  /**
   * Map database row to OfframpSession object
   */
  private mapDbToSession(data: any): OfframpSession {
    return {
      id: data.id,
      userId: data.user_id,
      step: data.step,
      data: data.data || {},
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      expiresAt: new Date(data.expires_at)
    };
  }
}

export const offrampSessionService = new OfframpSessionService();