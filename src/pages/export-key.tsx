"use client";

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';

interface WalletInfo {
  id: string;
  address: string;
  type: string;
}

interface ExportResponse {
  encryption_type: string;
  ciphertext: string;
  encapsulated_key: string;
  recipientPrivateKey: string;
}

export default function ExportKeyPage() {
  const { ready, authenticated, user } = usePrivy();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // User is already authenticated with server-side wallet creation
  // so we don't need to check for authentication here

  useEffect(() => {
    // Fetch wallets from server-side API instead of relying on client-side detection
    const fetchServerWallets = async () => {
      if (user?.id) {
        try {
          const response = await fetch(`/api/get-server-wallets?userId=${user.id}`);
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch wallets');
          }
          
          const data = await response.json();
          console.log('Server wallets:', data.wallets);
          setWallets(data.wallets);
        } catch (err) {
          console.error('Error fetching server wallets:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch wallets');
        }
      }
    };
    
    fetchServerWallets();
  }, [user]);

  const handleExport = async (walletId: string) => {
    setIsExporting(true);
    setError(null);
    setExportedKey(null);

    try {
      // Use the direct export API that doesn't require userId
      const response = await fetch('/api/direct-export-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Export error details:', errorData);
        throw new Error(errorData.error || 'Failed to export wallet');
      }

      const exportData: ExportResponse = await response.json();
      
      // For now, we'll show the encrypted data
      // In a production app, you'd want to implement HPKE decryption client-side
      setExportedKey(`Encrypted Private Key:\n\nCiphertext: ${exportData.ciphertext}\n\nEncapsulated Key: ${exportData.encapsulated_key}\n\nNote: This is encrypted data. You'll need to implement HPKE decryption to get the actual private key.`);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsExporting(false);
    }
  };

  const copyToClipboard = async () => {
    if (exportedKey) {
      await navigator.clipboard.writeText(exportedKey);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Export Wallet</h1>
          
          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          
          {wallets.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No embedded wallets found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="border rounded-lg p-4 hover:border-indigo-500 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{wallet.type}</p>
                      <p className="text-sm text-gray-500">{wallet.address}</p>
                      <p className="text-xs text-gray-400">ID: {wallet.id}</p>
                    </div>
                    <button
                      onClick={() => handleExport(wallet.id)}
                      disabled={isExporting}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                    >
                      {isExporting ? 'Exporting...' : 'Export'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {exportedKey && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium text-gray-900">Exported Data</h3>
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                >
                  Copy
                </button>
              </div>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all">
                {exportedKey}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}