"use client";

import React from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

interface WalletInfo {
    address: string;
}

interface ExportKeyPageContentProps {
    walletInfo: WalletInfo;
}

// This is the actual UI component that uses the Privy context.
function ExportUi({ walletAddress }: { walletAddress: string }) {
    const { ready, authenticated, user, exportWallet } = usePrivy();

    const hasEmbeddedWallet = !!user?.linkedAccounts?.find(
        (account) =>
            account.type === "wallet" &&
            account.walletClient === "privy" &&
            account.chainType === "ethereum" &&
            account.address?.toLowerCase() === walletAddress.toLowerCase()
    );

    const isAuthenticated = ready && authenticated;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="w-full max-w-md rounded-xl shadow-lg bg-white p-8 mt-8 text-center">
                <h1 className="text-2xl font-bold mb-6 text-indigo-700">Export Wallet</h1>
                <div className="mb-4">
                    <span className="font-mono text-sm break-all">{walletAddress}</span>
                </div>
                <button
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50"
                    onClick={exportWallet}
                    disabled={!isAuthenticated || !hasEmbeddedWallet}
                >
                    Export my wallet
                </button>
                {(!isAuthenticated || !hasEmbeddedWallet) && (
                    <div className="mt-2 text-xs text-gray-500">
                        {!isAuthenticated ? "Please log in to export your wallet." : "Embedded wallet not found for this address."}
                    </div>
                )}
            </div>
        </div>
    );
}

// This component wraps the UI with the PrivyProvider.
// It is the default export and is dynamically imported with ssr: false.
export default function ExportKeyPageContent({ walletInfo }: ExportKeyPageContentProps) {
    return (
        <PrivyProvider
            appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
            config={{
                embeddedWallets: {
                    createOnLogin: 'users-without-wallets',
                },
            }}
        >
            <ExportUi walletAddress={walletInfo.address} />
        </PrivyProvider>
    );
}
