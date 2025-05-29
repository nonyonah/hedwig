import { ethers } from 'ethers';

export async function fetchWalletBalance(address: string, provider: ethers.providers.Provider) {
  try {
    const balance = await provider.getBalance(address);
    return ethers.utils.formatEther(balance);
  } catch (error) {
    console.error('Failed to fetch wallet balance:', error);
    throw error;
  }
}