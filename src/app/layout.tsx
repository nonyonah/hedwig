import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
// import { cookies } from 'next/headers'; // Removed
// import { createServerClient } from '@supabase/ssr'; // Removed
import { Providers } from '@/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Albus',
  description: 'Your app description',
};

export default async function RootLayout({ // Changed to a simple function component if no async ops needed
  children,
}: {
  children: React.ReactNode;
}) {
  // const cookieStore = await cookies(); // Removed

  // const supabase = createServerClient( // Removed
  //   process.env.NEXT_PUBLIC_SUPABASE_URL!,
  //   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  //   {
  //     cookies: {
  //       async getAll() {
  //         return await cookieStore.getAll()
  //       },
  //       async setAll(cookiesToSet) {
  //         try {
  //           for (const { name, value, options } of cookiesToSet) {
  //             await cookieStore.set(name, value, options)
  //           }
  //         } catch {
  //           // The `setAll` method was called from a Server Component.
  //           // This can be ignored if you have middleware refreshing
  //           // user sessions.
  //         }
  //       },
  //     },
  //   }
  // ); // Removed

  // const { // Removed
  //   data: { session },
  // } = await supabase.auth.getSession(); // Removed

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Pass null or undefined for session, or remove if Providers doesn't need it anymore */}
        <Providers session={null}>{children}</Providers>
      </body>
    </html>
  );
}