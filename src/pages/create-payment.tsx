import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function CreatePaymentPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to home page as this page is disabled
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Redirecting...</h1>
        <p className="text-gray-600">This page has been disabled.</p>
      </div>
    </div>
  );
}