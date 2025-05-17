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
        style: {
          height: "40px",
          padding: "0 16px",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: "500",
          lineHeight: "1.25rem",
          backgroundColor: "#344e41",
          color: "#fff",
        },
      }}
      connectModal={{
        size: "wide",
        title: "Connect to Albus",
        showThirdwebBranding: false,
      }}
      detailsButton={{
        style: {
          height: "40px",
          padding: "0 16px",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: "500",
          lineHeight: "1.25rem",
          backgroundColor: "#344e41",
          color: "#fff",
        },
      }}
    />
  );
}
