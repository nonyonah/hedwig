// 'use client';

// import { ThemeProvider } from '@/components/theme-provider';
// import { SupabaseProvider } from './SupabaseProvider';
// import type { Session } from '@supabase/supabase-js';

// export function Providers({
//   children,
//   session,
// }: {
//   children: React.ReactNode;
//   session: Session | null;
// }) {
//   return (
//     <SupabaseProvider session={session}>
//       <ThemeProvider
//         attribute="class"
//         defaultTheme="system"
//         enableSystem
//         disableTransitionOnChange
//       >
//         {children}
//       </ThemeProvider>
//     </SupabaseProvider>
//   );
// }
