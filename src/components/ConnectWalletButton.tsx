'use client';

import { ConnectWallet } from "@thirdweb-dev/react";
import { formatAddress } from "@/lib/utils";
import { useAddress, useConnectionStatus } from "@thirdweb-dev/react";
import { useEffect, useState } from "react";
import Image from "next/image";

export function ConnectWalletButton() {
  const address = useAddress();
  const connectionStatus = useConnectionStatus();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  // Fetch Basename if ENS is not available
  useEffect(() => {
    async function fetchBasename() {
      if (!address) return;
      
      try {
        // Try to fetch Basename
        const response = await fetch(`https://api.basename.app/v1/address/${address}`);
        if (response.ok) {
          const data = await response.json();
          if (data.name) {
            setDisplayName(data.name);
          }
          if (data.avatar) {
            setAvatarUrl(data.avatar);
          }
        }
      } catch (error) {
        console.error("Error fetching Basename:", error);
      }
    }
    
    fetchBasename();
  }, [address]);

  // Set display name based on address if no ENS or Basename
  useEffect(() => {
    if (!displayName && address) {
      setDisplayName(formatAddress(address));
    }
  }, [address, displayName]);

  // Use the ConnectWallet component directly with customization
  return (
    <ConnectWallet 
      theme="light"
      btnTitle={isConnected ? (displayName || (address ? formatAddress(address) : "Connected")) : "Connect Wallet"}
      modalTitle="Wallet Options"
      modalSize="compact"
      welcomeScreen={{
        title: "albus",
        subtitle: "Connect your wallet to get started",
      }}
      className="h-9 px-4 py-2" // Match the height of the shadcn/ui Button component
      detailsBtn={() => {
        return (
          <div className="flex items-center gap-2">
            {avatarUrl && (
              <Image 
                src={avatarUrl} 
                alt="Profile" 
                width={20} 
                height={20} 
                className="rounded-full"
              />
            )}
            <span>{displayName || (address ? formatAddress(address) : "Connected")}</span>
          </div>
        );
      }}
    />
  );
}