import { createConfig, http } from 'wagmi';
import { mainnet, base, optimism, arbitrum, bsc } from 'wagmi/chains';

// Configure chains for the application
export const config = createConfig({
  chains: [mainnet, base, optimism, arbitrum, bsc],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [bsc.id]: http(),
  },
});