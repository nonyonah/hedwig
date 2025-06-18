import { createClient } from '@supabase/supabase-js';
import { Database } from './database';
import { loadServerEnvironment } from './serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

// Get Supabase URL and keys from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// IMPORTANT: This key should ONLY be used server-side and never exposed to the client
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create regular client with anon key - this is safe to use on both client and server
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Create admin client with the service role key - ONLY use this server-side
// This client bypasses RLS policies and should be used with caution
export const supabaseAdmin = typeof window === 'undefined' 
  ? createClient<Database>(supabaseUrl, supabaseServiceRoleKey as string)
  : supabase; // Fallback to regular client on client-side for safety
