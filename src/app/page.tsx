'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState<{status: string; message: string; timestamp: string} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/status');
        const data = await response.json();
        setStatus(data);
      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-6">Welcome to Albus</h1>
      {status && (
        <div className="bg-white p-6 rounded-lg shadow-md max-w-md w-full">
          <h2 className="text-xl font-semibold mb-2">API Status</h2>
          <p className="mb-1">Status: <span className="font-medium">{status.status}</span></p>
          <p className="mb-1">Message: <span className="font-medium">{status.message}</span></p>
          <p className="text-sm text-gray-600">Last checked: {new Date(status.timestamp).toLocaleString()}</p>
        </div>
      )}
    </main>
  );
}