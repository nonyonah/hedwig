import React from 'react';
import { useAppKitWallet } from '../hooks/useAppKitWallet';
import { AppKitButton } from '../components/AppKitButton';
import { useWriteContract } from 'wagmi';

export default function TestWallet() {
  const { isConnected, address, chainId } = useAppKitWallet();
  const { writeContract, isPending, error } = useWriteContract();

  const testTransaction = () => {
    if (!isConnected) {
      alert('Please connect wallet first');
      return;
    }

    console.log('Connected:', isConnected);
    console.log('Address:', address);
    console.log('Chain ID:', chainId);
    console.log('Hedwig Contract Address:', process.env.NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS_BASE_SEPOLIA);
    
    alert(`Wallet connected! Address: ${address}, Chain: ${chainId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6">Wallet Connection Test</h1>
        
        {!isConnected ? (
          <div>
            <p className="mb-4">Connect your wallet to test the integration:</p>
            <AppKitButton />
          </div>
        ) : (
          <div>
            <p className="mb-2"><strong>Status:</strong> Connected ✅</p>
            <p className="mb-2"><strong>Address:</strong> {address}</p>
            <p className="mb-2"><strong>Chain ID:</strong> {chainId}</p>
            <p className="mb-4"><strong>Contract:</strong> {process.env.NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS_BASE_SEPOLIA}</p>
            
            <button
              onClick={testTransaction}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
            >
              Test Connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}