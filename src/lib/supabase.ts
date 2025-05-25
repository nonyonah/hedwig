'use client';

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
);

type Provider = 'google' | 'github' | 'twitter';

/**
 * Retrieves the current user session from Supabase.
 */
export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { data: session, error: null };
  } catch (error) {
    console.error('Error getting session:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Initiates the Supabase OAuth flow for a given provider.
 * Redirects the user to the provider's login page.
 * The actual session creation happens in the /auth/callback route.
 */
export async function signInWithOAuth(
  provider: Provider
) {
  try {
    // Use a relative URL for redirectTo. Ensure this matches your deployment.
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : '/auth/callback'; // Fallback for SSR, adjust if needed

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          // Prevent double authentication by using 'select_account'
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error signing in with OAuth:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Signs the current user out.
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error: error as Error };
  }
}