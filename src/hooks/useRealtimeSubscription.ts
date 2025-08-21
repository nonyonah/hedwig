import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeSubscriptionOptions {
  table: 'payment_links' | 'invoices' | 'proposals';
  id: string | undefined;
  onUpdate: (payload: any) => void;
  enabled?: boolean;
}

/**
 * Custom hook for managing Supabase Realtime subscriptions
 * Automatically handles subscription lifecycle and cleanup
 */
export function useRealtimeSubscription({
  table,
  id,
  onUpdate,
  enabled = true
}: UseRealtimeSubscriptionOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    if (!enabled || !id) return;

    // Initialize Supabase client if not already done
    if (!supabaseRef.current) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('Supabase environment variables not found for realtime subscription');
        return;
      }
      
      supabaseRef.current = createClient(supabaseUrl, supabaseAnonKey);
    }

    const supabase = supabaseRef.current;
    
    // Create a unique channel name for this subscription
    const channelName = `${table}_${id}_updates`;
    
    // Create and configure the realtime channel
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: table,
          filter: `id=eq.${id}`
        },
        (payload) => {
          console.log(`Realtime update received for ${table}:`, payload);
          onUpdate(payload);
        }
      )
      .subscribe((status) => {
        console.log(`Realtime subscription status for ${table}:`, status);
      });

    channelRef.current = channel;

    // Cleanup function
    return () => {
      if (channelRef.current) {
        console.log(`Unsubscribing from ${table} realtime updates`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, id, onUpdate, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
      }
    };
  }, []);

  return {
    isSubscribed: !!channelRef.current
  };
}

export default useRealtimeSubscription;