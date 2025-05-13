import { useState, useEffect } from 'react';
import { supabase, getSession } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface UserState {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

export function useUser() {
  const [state, setState] = useState<UserState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Get the initial session
    const fetchUser = async () => {
      try {
        const { data: session, error } = await getSession();
        
        if (error) {
          throw error;
        }
        
        setState({
          user: session?.user || null,
          loading: false,
          error: null,
        });
      } catch (error) {
        setState({
          user: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error occurred'),
        });
      }
    };

    fetchUser();

    // Set up auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setState({
          user: session?.user || null,
          loading: false,
          error: null,
        });
      }
    );

    // Clean up subscription on unmount
    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
  };
}