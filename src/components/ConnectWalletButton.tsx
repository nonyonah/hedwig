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
      connectModal={{
         size: "compact",
        title: "Connect to Albus",
        showThirdwebBranding: false,
       }}
    />
  );
}
