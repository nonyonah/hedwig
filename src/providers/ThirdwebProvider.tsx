'use client';

import { ThirdwebProvider } from "thirdweb/react";
import { ReactNode } from "react";
import { ethereum, base, optimism, arbitrum, bsc } from "thirdweb/chains";
import { createThirdwebClient, type ThirdwebClient } from "thirdweb"; 

// Create the client for use in other components
export const client: ThirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "", 
});

export const defaultSupportedChains = [ethereum, base, optimism, arbitrum, bsc];
export const defaultDAppMeta = {
  name: "Albus",
  description: "Your web3 dashboard",
  logoUrl: "/logo.png", 
  url: "https://yourdapp.com", 
};

export function ThirdwebProviderWrapper({ children }: { children: ReactNode }) {
  return (
    <ThirdwebProvider>
      {children}
    </ThirdwebProvider>
  );
}

// // Previous v4 or incorrect v5 attempt (for reference):
// // import { ThirdwebProvider } from "@thirdweb-dev/react";
// // import { ReactNode } from "react";
// // import { Ethereum, Base, Optimism, Arbitrum, Binance } from "@thirdweb-dev/chains";

// // export function ThirdwebProviderWrapper({ children }: { children: ReactNode }) {
// //   return (
// //     <ThirdwebProvider
// //       activeChain={Ethereum} // Not a v5 ThirdwebProvider prop
// //       clientId={process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID} // Not a v5 ThirdwebProvider prop
// //       supportedChains={[Ethereum, Base, Optimism, Arbitrum, Binance]} // Not a v5 ThirdwebProvider prop
// //       dAppMeta={{
// //         name: "Albus",
// //         description: "Your web3 dashboard",
// //         logoUrl: "/logo.png",
// //         url: "https://yourdapp.com",
// //       }} // Not a v5 ThirdwebProvider prop
// //     >
// //       {children}
// //     </ThirdwebProvider>
// //   );
// // }