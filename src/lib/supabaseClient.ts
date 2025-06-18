import { createClient } from '@supabase/supabase-js';
import { Database } from './database';
import { loadServerEnvironment } from './serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// Create regular client with anon key
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Create admin client with service role key for bypassing RLS
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey);
