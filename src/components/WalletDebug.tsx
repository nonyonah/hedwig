import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useReadContract } from 'wagmi';

const USDC_CONTRACT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_MAINNET_CHAIN_ID = 8453;

export function WalletDebug() {
  // Wagmi account hook
  const { address: wagmiAddress, isConnected: wagmiConnected, chainId: wagmiChainId } = useAccount();
  
  // Read USDC balance using wagmi
  const { data: usdcBalance } = useReadContract({
    address: USDC_CONTRACT_ADDRESS,
    abi: [{
      "inputs": [{"name": "account", "type": "address"}],
      "name": "balanceOf",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'balanceOf',
    args: wagmiAddress ? [wagmiAddress] : undefined,
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: !!wagmiAddress,
    },
  });
  
  const formattedBalance = usdcBalance ? formatUnits(usdcBalance, 6) : '0';
  
  return (
    <div className="p-4 border rounded-lg bg-gray-50 space-y-2">
      <h3 className="font-bold text-lg">Wallet Debug Info</h3>
      
      <div className="space-y-1">
        <p><strong>Wagmi Connected:</strong> {wagmiConnected ? 'Yes' : 'No'}</p>
        <p><strong>Wagmi Address:</strong> {wagmiAddress || 'Not connected'}</p>
        <p><strong>Wagmi Chain ID:</strong> {wagmiChainId || 'Unknown'}</p>
        <p><strong>Chain ID:</strong> {wagmiChainId || 'Unknown'}</p>
        <p><strong>USDC Balance:</strong> {formattedBalance} USDC</p>
        <p><strong>Raw Balance:</strong> {usdcBalance?.toString() || '0'}</p>
      </div>
      

      
      {wagmiChainId !== BASE_MAINNET_CHAIN_ID && (
        <div className="p-2 bg-yellow-100 border border-yellow-300 rounded">
          <p className="text-yellow-700 font-semibold">⚠️ Wrong Network!</p>
          <p className="text-sm text-yellow-600">Please switch to Base Mainnet (Chain ID: {BASE_MAINNET_CHAIN_ID})</p>
        </div>
      )}
      
      {!wagmiConnected && (
        <div className="p-2 bg-blue-100 border border-blue-300 rounded">
          <p className="text-blue-700 font-semibold">ℹ️ Wallet Not Connected</p>
          <p className="text-sm text-blue-600">Please connect your wallet to see balance information.</p>
        </div>
      )}
    </div>
  );
}