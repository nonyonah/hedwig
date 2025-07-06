import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ExportWalletButton({ 
  address, 
  walletId, 
  useModal = false 
}: { 
  address: string; 
  walletId?: string;
  useModal?: boolean; 
}) {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Since wallets are created server-side, we don't need to check for embedded wallets client-side
  // We'll assume the wallet exists if we have an address and walletId

  const handleExport = async () => {
    if (useModal && walletId) {
      setIsExporting(true);
      setError(null);
      
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

        const exportData = await response.json();
        
        // Create a modal or alert to show the encrypted data
        alert(`Encrypted Private Key:\n\nCiphertext: ${exportData.ciphertext}\n\nEncapsulated Key: ${exportData.encapsulated_key}\n\nNote: This is encrypted data. You'll need to implement HPKE decryption to get the actual private key.`);
        
      } catch (err) {
        console.error('Export error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setIsExporting(false);
      }
    } else {
      router.push('/export-key');
    }
  };

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50"
      >
        {isExporting ? 'Exporting...' : 'Export my wallet'}
      </button>
      {error && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
