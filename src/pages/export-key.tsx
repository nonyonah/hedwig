"use client";

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { PrivyProvider } from '@privy-io/react-auth';
import ExportKeyPageContent from './export-key-content';

interface ApiResponse {
  walletAddress: string;
  userId: string;
}

export default function ExportKeyTokenPage() {
  const router = useRouter();
  const { token } = router.query;
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || typeof token !== 'string') return;
    setLoading(true);
    fetch(`/api/export-key?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || 'Invalid or expired link');
        return res.json();
      })
      .then((data: ApiResponse) => {
        setWalletAddress(data.walletAddress);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Invalid or expired link');
        setWalletAddress(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PrivyProvider
      appId={process.env.PRIVY_APP_ID!}
      config={{ appearance: { theme: 'light' }, embeddedWallets: { requireUserPasswordOnCreate: false } }}
    >
      <Head>
        <title>Hedwig Wallet Export</title>
      </Head>
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl shadow-lg bg-white p-8 mt-8">
          <h1 className="text-2xl font-bold mb-6 text-center text-indigo-700">Hedwig Wallet Recovery</h1>
          {loading && <div className="text-center">Validating link...</div>}
          {error && <div className="text-center text-red-500">{error}</div>}
          {walletAddress && !error && (
            <ExportKeyPageContent walletAddress={walletAddress} />
          )}
        </div>
      </div>
    </PrivyProvider>
  );
}

