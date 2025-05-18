'use client';

import { ConnectButton } from "thirdweb/react";
import { client, defaultSupportedChains, defaultDAppMeta } from "@/providers/ThirdwebProvider";

export default function ConnectWalletButton() {
  return (
    <ConnectButton
      client={client}
      chains={defaultSupportedChains}
      appMetadata={defaultDAppMeta}
      theme="light" // Light theme for better text contrast
      connectButton={{
        style: {
          height: "40px",
          padding: "0 16px",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: "500",
          lineHeight: "1.25rem",
          backgroundColor: "#403d39", // Updated to new primary color
          color: "#ffffff", // White text for contrast
        },
      }}
      connectModal={{
        size: "wide",
        title: "Connect to Albus",
        showThirdwebBranding: false,
      }}
      detailsButton={{
        connectedAccountAvatarUrl: "", // Empty string to remove the avatar
        style: {
          height: "40px",
          padding: "0 16px",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: "500",
          lineHeight: "1.25rem",
          backgroundColor: "#403d39", // Updated to new primary color
          color: "#ffffff", // White text for contrast
        },
      }}
    />
  );
}
