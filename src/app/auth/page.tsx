'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Automatically redirect to the sign-in page
    router.replace('/auth/signin');
  }, [router]);
  
  // Return null or a loading indicator while redirecting
  return null;
}