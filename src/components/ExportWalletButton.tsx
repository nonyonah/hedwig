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

  const handleExport = () => {
  setError(null);
  alert('Private key export is currently unavailable.');
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
