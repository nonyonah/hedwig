'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

const SupabaseContext = createContext<{ session: Session | null }>({ session: null });

export function SupabaseProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (newSession?.access_token !== session?.access_token) {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router, session]);

  return (
    <SupabaseContext.Provider value={{ session }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};
