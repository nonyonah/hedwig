'use client';

import { ConnectButton } from "thirdweb/react";
import { client, defaultSupportedChains, defaultDAppMeta } from "@/providers/ThirdwebProvider";

export default function ConnectWalletButton() {
  return (
    <ConnectButton
      client={client}
      chains={defaultSupportedChains}
      appMetadata={defaultDAppMeta}
      theme="dark"
      connectButton={{
        // Button styling properties
        style: {
          height: "40px", // Match Shadcn button height
          padding: "0 16px", // Match Shadcn button padding
          borderRadius: "0.375rem", // Match Shadcn button border radius
          fontSize: "0.875rem", // Match Shadcn button font size
          fontWeight: "500", // Match Shadcn button font weight
          lineHeight: "1.25rem" // Match Shadcn button line height
        }
      }}
      connectModal={{
        size: "wide",
        title: "Connect to Albus",
        showThirdwebBranding: false,
      }}
      detailsButton={{
        // Style the connected button to match Shadcn
        style: {
          height: "40px", // Match Shadcn button height
          padding: "0 16px", // Match Shadcn button padding
          borderRadius: "0.375rem", // Match Shadcn button border radius
          fontSize: "0.875rem", // Match Shadcn button font size
          fontWeight: "500", // Match Shadcn button font weight
          lineHeight: "1.25rem" // Match Shadcn button line height
        },
      }}
    />
  );
}
