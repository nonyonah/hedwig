'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientLoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to home page as this page is disabled
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
