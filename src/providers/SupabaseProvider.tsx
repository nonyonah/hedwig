// 'use client';

// import { createBrowserClient } from '@supabase/ssr';
// // import { useRouter } from 'next/navigation'; // No longer needed for auth redirects here
// import { createContext, useContext, useState, useEffect } from 'react'; // useEffect might not be needed
// // import type { Session } from '@supabase/supabase-js'; // Session type no longer needed here

// // Context will now provide the Supabase client instance directly, or can be removed if lib/supabase.ts is always used.
// // For simplicity, let's assume direct import of `supabase` from `lib/supabase.ts` is preferred in components.
// // This provider might become redundant if it only holds the client.
// // However, if you want a context for the client, it would look like this:

// interface SupabaseContextType {
//   supabase: ReturnType<typeof createBrowserClient>;
// }

// const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

// export function SupabaseProvider({
//   children,
// }: {
//   children: React.ReactNode;
//   // session prop is removed
// }) {
//   const [supabaseClient] = useState(() =>
//     createBrowserClient(
//       process.env.NEXT_PUBLIC_SUPABASE_URL!,
//       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
//     )
//   );

//   // const router = useRouter(); // Removed

//   // useEffect for onAuthStateChange is removed
//   // useEffect(() => {
//   //   const {
//   //     data: { subscription },
//   //   } = supabaseClient.auth.onAuthStateChange((event, newSession) => {
//   //     if (newSession?.access_token !== session?.access_token) {
//   //       router.refresh();
//   //     }
//   //   });
//   // 
//   //   return () => {
//   //     subscription.unsubscribe();
//   //   };
//   // }, [supabaseClient, router, session]); // Dependencies changed

//   return (
//     <SupabaseContext.Provider value={{ supabase: supabaseClient }}>
//       {children}
//     </SupabaseContext.Provider>
//   );
// }

// export const useSupabaseClient = () => { // Renamed hook for clarity
//   const context = useContext(SupabaseContext);
//   if (context === undefined) {
//     throw new Error('useSupabaseClient must be used within a SupabaseProvider');
//   }
//   return context.supabase;
// };
