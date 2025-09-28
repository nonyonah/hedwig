export const SUPPORTED_OFFRAMP_NETWORKS = ['base', 'arbitrum', 'celo', 'lisk'];

export function validateOfframpNetwork(network: string): { isValid: boolean; message?: string } {
  const normalizedNetwork = network.toLowerCase();
  
  if (!SUPPORTED_OFFRAMP_NETWORKS.includes(normalizedNetwork)) {
    const networkName = network.charAt(0).toUpperCase() + network.slice(1);
    return {
      isValid: false,
      message: `Offramp is currently not available on ${networkName} network. Please use Base, Arbitrum, Celo, or Lisk.`
    };
  }
  
  return { isValid: true };
}

// Removed showOfframpNetworkAlert as it's UI-related (uses alert())