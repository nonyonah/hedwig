'use client';

import { ThirdwebProvider } from "@thirdweb-dev/react";
import { ReactNode } from "react";

interface ThirdwebProviderWrapperProps {
  children: ReactNode;
}

export function ThirdwebProviderWrapper({ children }: ThirdwebProviderWrapperProps) {
  return (
    <ThirdwebProvider
      activeChain="base"
      clientId={process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID}
      dAppMeta={{
        name: "Albus",
        description: "Your web3 dashboard",
        logoUrl: "/logo.png",
        url: "https://yourdapp.com",
      }}
    >
      {children}
    </ThirdwebProvider>
  );
}