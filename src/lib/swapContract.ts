import { ethers } from 'ethers';
import SwapABI from '../contracts/Swap.json';

const swapAddress = '0xYourSwapContractAddress';

export async function getSwapRate(tokenIn: string, tokenOut: string, amountIn: string, provider: ethers.providers.Provider) {
  const contract = new ethers.Contract(swapAddress, SwapABI, provider);
  return await contract.getRate(tokenIn, tokenOut, amountIn);
}

export async function swapTokens(
  signer: ethers.Signer,
  tokenIn: string,
  tokenOut: string,
  amountIn: string
) {
  const contract = new ethers.Contract(swapAddress, SwapABI, signer);
  const tx = await contract.swap(tokenIn, tokenOut, amountIn);
  return await tx.wait();
}