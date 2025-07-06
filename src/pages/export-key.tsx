"use client";

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { PrivyProvider } from '@privy-io/react-auth';
import ExportKeyPageContent from './export-key-content';

function ExportKeyPage() {
  const router = useRouter();
  const { token } = router.query;
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
        setLoading(false);
        setError('No token provided.');
        return;
    }

    fetch(`/api/export-key?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        setWalletAddress(data.walletAddress);
      })
      .catch(err => {
        setError(err.message || 'Invalid or expired link.');
      })
      .finally(() => setLoading(false));
  }, [router.isReady, token]);

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{ appearance: { theme: 'light' }, embeddedWallets: { requireUserPasswordOnCreate: false } }}
    >
      <Head>
        <title>Export Private Key</title>
      </Head>
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <p>Validating link...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h2 className="text-lg font-bold mb-2 text-red-600">Error</h2>
          <p>{error}</p>
        </div>
      ) : walletAddress ? (
        <ExportKeyPageContent walletAddress={walletAddress} />
      ) : null}
    </PrivyProvider>
  );
}

export default dynamic(() => Promise.resolve(ExportKeyPage), { ssr: false });
