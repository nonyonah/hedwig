import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface OfframpSession {
  id: string;
  userId: string;
  step: 'amount' | 'payout_method' | 'bank_selection' | 'account_number' | 'confirmation' | 'final_confirmation' | 'processing' | 'completed';
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
    
    // Get current session data
    const { data: currentData, error: fetchError } = await supabase
      .from('offramp_sessions')
      .select('data')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch session: ${fetchError.message}`);
    }

    // Merge current data with new data
    const mergedData = { ...currentData.data, ...data };

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
      throw new Error(`Failed to update session: ${error.message}`);
    }

    return this.mapDbToSession(updatedData);
  }

  /**
   * Clear/delete session
   */
  async clearSession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('offramp_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to clear session: ${error.message}`);
    }
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