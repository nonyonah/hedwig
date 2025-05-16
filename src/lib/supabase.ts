import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { Provider } from '@supabase/supabase-js' // Correct import for Provider type

// Initialize the Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Basic validation
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing. Authentication and database features may not work.'
  );
}

// Create and export the Supabase client
// We assume credentials are valid if provided; createClient handles deeper validation
export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Helper type for the return value of helpers
type SupabaseHelperResponse<T> = { data: T | null; error: Error | null };

/**
 * Initiates the Supabase OAuth flow for a given provider.
 * Redirects the user to the provider's login page.
 * The actual session creation happens in the /auth/callback route.
 */
export const signInWithOAuth = async (
  provider: Provider
): Promise<SupabaseHelperResponse<null>> => {
  try {
    // Use a relative URL for redirectTo. Ensure this matches your deployment.
    const redirectTo = typeof window !== 'undefined' 
      ? `${window.location.origin}/auth/callback`
      : '/auth/callback'; // Fallback for SSR, adjust if needed

    
    // With this (using underscore to indicate intentional non-use):
    const { data: _data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // Recommended options for Google:
        queryParams: {
          access_type: 'offline',
          prompt: 'consent select_account',
        },
      },
    });
    
    if (error) throw error;
    // No direct data returned here, flow continues via redirect
    return { data: null, error: null }; 
  } catch (error) {
    console.error(`Error signing in with ${provider}:`, error);
    return { 
      data: null, 
      error: error instanceof Error ? error : new Error('OAuth sign-in failed') 
    };
  }
};

/**
 * Retrieves the current user session from Supabase.
 */
export const getSession = async (): Promise<SupabaseHelperResponse<Session>> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    // Return session object under 'data' key to match the type
    return { data: data.session, error: null }; 
  } catch (error) {
    console.error('Error getting session:', error);
    return { 
      // Return null session under 'data' key
      data: null, 
      error: error instanceof Error ? error : new Error('Failed to get session') 
    }; 
  }
};

/**
 * Signs the current user out.
 */
export const signOut = async (): Promise<SupabaseHelperResponse<null>> => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error : new Error('Sign out failed') 
    };
  }
};