"use client";

import React, { useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

interface ExportKeyPageContentProps {
  walletAddress: string;
}

export default function ExportKeyPageContent({ walletAddress }: ExportKeyPageContentProps) {
  const { exportWallet, ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const evmWallet = wallets.find(w => w.address.toLowerCase() === walletAddress.toLowerCase());

  const handleExport = useCallback(() => {
    if (!authenticated) {
      login();
      return;
    }
    if (evmWallet) {
      exportWallet(evmWallet);
    } else {
      alert("No wallet found for this address. Please ensure you are logged in with the correct account.");
    }
  }, [authenticated, evmWallet, exportWallet, login]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-xl shadow-lg bg-white p-8 mt-8">
        <h1 className="text-2xl font-bold mb-6 text-center text-indigo-700">Hedwig Wallet Recovery</h1>
        <div className="mb-8">
          <div className="flex flex-col items-center">
            <button
              className="w-full py-3 px-4 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition mb-2"
              onClick={handleExport}
              disabled={!ready}
            >
              Export EVM Wallet Private Key
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              You must be logged in to your Privy account. Never share your private key with anyone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
