import { createClient } from '@supabase/supabase-js';
import { Database, MessageDirection, MessageType } from './database';

// Database types
export type User = Database['public']['Tables']['users']['Row'];
export type Wallet = Database['public']['Tables']['wallets']['Row'];
export type Session = Database['public']['Tables']['sessions']['Row'];
export type MessageLog = Database['public']['Tables']['message_logs']['Row'];
export type ErrorLog = Database['public']['Tables']['errors']['Row'];

// Create a single supabase client for interacting with your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase URL or key');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
});

// Database operations
export const db = {
  // User operations
  async getUserByPhone(phone: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phone)
      .single();
    return error ? null : data;
  },

  async createUser(phone: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert({ phone_number: phone })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Wallet operations
  async getUserWallet(userId: string): Promise<Wallet | null> {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    return error ? null : data;
  },

  async createWallet(wallet: Omit<Wallet, 'id' | 'created_at'>): Promise<Wallet> {
    const { data, error } = await supabase
      .from('wallets')
      .insert(wallet)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Session operations
  async createSession(session: Omit<Session, 'id' | 'created_at'>): Promise<Session> {
    const { data, error } = await supabase
      .from('sessions')
      .insert(session)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async validateSession(token: string): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();
    return error ? null : data;
  },

  // Token operations
  async getUserTokens(userId: string) {
    const { data } = await supabase
      .from('tokens')
      .select('*')
      .eq('user_id', userId);
    return data || [];
  },

  // NFT operations
  async getUserNFTs(userId: string) {
    const { data, error } = await supabase
      .from('nfts')
      .select('*')
      .eq('owner_id', userId);
    return error ? [] : data;
  },

  // Message logging
  async logMessage(
    userId: string,
    messageType: MessageType,
    content: string,
    direction: MessageDirection,
    metadata?: Record<string, any>
  ): Promise<MessageLog> {
    const { data, error } = await supabase
      .from('message_logs')
      .insert({
        user_id: userId,
        message_type: messageType,
        content: content.substring(0, 1000), // Limit content length
        direction,
        metadata,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Error logging
  async logError(
    errorType: string,
    errorMessage: string,
    userId?: string,
    stackTrace?: string,
    metadata?: Record<string, any>
  ): Promise<ErrorLog> {
    const { data, error } = await supabase
      .from('errors')
      .insert({
        user_id: userId || null,
        error_type: errorType,
        error_message: errorMessage.substring(0, 1000), // Limit message length
        stack_trace: stackTrace?.substring(0, 5000), // Limit stack trace length
        metadata,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Rate limiting
  async checkRateLimit(userId: string, windowMs: number, maxRequests: number): Promise<{ isRateLimited: boolean; retryAfter?: number }> {
    const now = new Date().toISOString();
    const windowStart = new Date(Date.now() - windowMs).toISOString();

    // Get or create rate limit record
    const { data: rateLimit, error } = await supabase
      .from('rate_limits')
      .upsert(
        {
          user_id: userId,
          request_count: 1,
          first_request_at: now,
          last_request_at: now,
          updated_at: now,
        },
        {
          onConflict: 'user_id',
          ignoreDuplicates: true,
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error in checkRateLimit:', error);
      return { isRateLimited: true }; // Fail closed on error
    }

    // Check if we need to reset the counter
    if (new Date(rateLimit.first_request_at) < new Date(windowStart)) {
      // Reset the counter
      const { data: resetData, error: resetError } = await supabase
        .from('rate_limits')
        .update({
          request_count: 1,
          first_request_at: now,
          last_request_at: now,
          updated_at: now,
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (resetError) throw resetError;
      return { isRateLimited: false };
    }

    // Check if user has exceeded the limit
    if (rateLimit.request_count >= maxRequests) {
      const retryAfter = Math.ceil(
        (new Date(rateLimit.first_request_at).getTime() + windowMs - Date.now()) / 1000
      );
      return { isRateLimited: true, retryAfter };
    }

    // Increment the counter
    const { error: incrementError } = await supabase
      .from('rate_limits')
      .update({
        request_count: rateLimit.request_count + 1,
        last_request_at: now,
        updated_at: now,
      })
      .eq('user_id', userId);

    if (incrementError) throw incrementError;
    return { isRateLimited: false };
  },

  // Get user's recent messages (for context in conversations)
  async getUserMessageHistory(userId: string, limit = 10): Promise<MessageLog[]> {
    const { data, error } = await supabase
      .from('message_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    return error ? [] : data;
  },
};

// Authentication utilities
export const auth = {
  async authenticateUser(phone: string) {
    // In a real app, implement OTP verification here
    let user = await db.getUserByPhone(phone);
    if (!user) {
      user = await db.createUser(phone);
    }

    // Create session
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const session = await db.createSession({
      user_id: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    });

    return { user, session };
  },

  async requireAuth(token: string) {
    const session = await db.validateSession(token);
    if (!session) {
      throw new Error('Invalid or expired session');
    }
    return session;
  },
};

export default supabase;