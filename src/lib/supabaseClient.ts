import { createClient } from '@supabase/supabase-js';
import { Database } from './database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Use service role key for server-side operations to bypass RLS policies
// This key should NEVER be exposed to the client
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create a client with the service role key for server-side operations
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey);

// Create a client with the anon key for client-side operations
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
