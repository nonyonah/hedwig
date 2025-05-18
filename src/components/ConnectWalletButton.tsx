'use client';

import { ConnectButton } from "thirdweb/react";
import { client, defaultSupportedChains, defaultDAppMeta } from "@/providers/ThirdwebProvider";

export default function ConnectWalletButton() {
  return (
    <ConnectButton
      client={client}
      chains={defaultSupportedChains}
      appMetadata={defaultDAppMeta}
      theme="light" // Changed from "dark" to "light" for better text contrast
      connectButton={{
        style: {
          height: "40px",
          padding: "0 16px",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: "500",
          lineHeight: "1.25rem",
          backgroundColor: "#344e41",
          color: "#ffffff", // Explicitly set to white
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
          backgroundColor: "#344e41",
          color: "#ffffff", // Explicitly set to white
        },
      }}
    />
  );
}
