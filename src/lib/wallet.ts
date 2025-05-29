import { getWalletBalance } from 'onchainkit';

export async function fetchWalletBalance(address: string, chain: string = 'ethereum') {
  try {
    const balance = await getWalletBalance(address, { chain });
    return balance;
  } catch (error) {
    console.error('Failed to fetch wallet balance:', error);
    throw error;
  }
}
