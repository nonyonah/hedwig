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

  if (typeof window === 'undefined') return null;
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{ appearance: { theme: 'light' }, embeddedWallets: { requireUserPasswordOnCreate: false } }}
    >
      <Head>
        <title>Export Private Key</title>
      </Head>
      {error ? (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h2 className="text-lg font-bold mb-2 text-red-600">Error</h2>
          <p>{error}</p>
        </div>
      ) : !walletAddress ? (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <p>Loading...</p>
        </div>
      ) : (
        <ExportKeyPageContent walletAddress={walletAddress} />
      )}
    </PrivyProvider>
  );
}

