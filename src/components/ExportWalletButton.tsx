import { usePrivy } from '@privy-io/react-auth';

export function ExportWalletButton({ address }: { address: string }) {
  const { ready, authenticated, user, exportWallet } = usePrivy();
  const isAuthenticated = ready && authenticated;
  const hasEmbeddedWallet = !!user?.linkedAccounts?.find(
    (account) =>
      account.type === 'wallet' &&
      account.walletClientType === 'privy' &&
      account.chainType === 'ethereum' &&
      account.address?.toLowerCase() === address.toLowerCase()
  );

  return (
    <button
      onClick={() => exportWallet({ address })}
      disabled={!isAuthenticated || !hasEmbeddedWallet}
      className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50"
    >
      Export my wallet
    </button>
  );
}
