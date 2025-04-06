import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials are missing. Authentication features will not work properly.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to handle OAuth sign in
export const signInWithOAuth = async (provider: 'google' | 'apple') => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`Error signing in with ${provider}:`, error);
    return { data: null, error };
  }
};

// Helper function to get the current session
export const getSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { session: data.session, error: null };
  } catch (error) {
    console.error('Error getting session:', error);
    return { session: null, error };
  }
};

// Helper function to sign out
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error };
  }
};