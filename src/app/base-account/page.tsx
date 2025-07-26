'use client';

import BaseAccountWallet from '@/components/BaseAccountWallet';

export default function BaseAccountPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Base Account Integration
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Experience the power of Coinbase Smart Accounts with universal sign-on, 
            gasless transactions, and seamless USDC payments.
          </p>
        </div>
        
        <BaseAccountWallet />
      </div>
    </div>
  );
}