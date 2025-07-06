"use client";

// Polyfill for crypto.getRandomValues in Node.js (SSR fallback, not for production use)
if (typeof window === 'undefined' && typeof global !== 'undefined') {
  try {
    const nodeCrypto = require('crypto');
    if (!global.crypto) {
      (global as any).crypto = {};
    }
    if (!(global as any).crypto.getRandomValues) {
      (global as any).crypto.getRandomValues = function (buffer: Uint8Array) {
        return nodeCrypto.randomFillSync(buffer);
      };
    }
  } catch (e) {
    // Ignore if crypto is not available
  }
}

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';

// Dynamically import the content component with SSR disabled
const ExportKeyPageContent = dynamic(
  () => import('./export-key-content'),
  { ssr: false }
);

interface WalletInfo {
  address: string;
}

const ExportKeyPage = () => {
  const router = useRouter();
  const { token } = router.query;
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!router.isReady) return;

    const t = Array.isArray(token) ? token[0] : token;

    if (t) {
      fetch(`/api/export-key?token=${t}`)
        .then(async (res) => {
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Failed to verify token' }));
            throw new Error(errorData.message || 'Failed to verify token');
          }
          return res.json();
        })
        .then((data) => {
          setWalletInfo(data);
        })
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setError('No token provided.');
      setLoading(false);
    }
  }, [token, router.isReady]);

  if (loading) {
    return (
        <div>
            <Head>
                <title>Export Private Key</title>
            </Head>
            <div className="flex flex-col items-center justify-center min-h-screen">
                <p>Validating link...</p>
            </div>
        </div>
    );
  }

  if (error) {
    return (
        <div>
            <Head>
                <title>Export Private Key</title>
            </Head>
            <div className="flex flex-col items-center justify-center min-h-screen">
                <h2 className="text-lg font-bold mb-2 text-red-600">Error</h2>
                <p>{error}</p>
            </div>
        </div>
    );
  }

  if (!walletInfo) {
    return (
        <div>
            <Head>
                <title>Export Private Key</title>
            </Head>
            <div className="flex flex-col items-center justify-center min-h-screen">
                <p>No wallet information found.</p>
            </div>
        </div>
    );
  }

  return (
    <div>
        <Head>
            <title>Export Private Key</title>
        </Head>
        <ExportKeyPageContent walletInfo={walletInfo} />
    </div>
  );
};

export default ExportKeyPage;
