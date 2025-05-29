import { ethers } from 'ethers';
import SwapABI from '../contracts/Swap.json';

const swapAddress = '0x2F84178e287123EB9AA9b914Da85f9B187cBA249';

export async function getSwapRate(tokenIn: string, tokenOut: string, amountIn: string, provider: ethers.providers.Provider) {
  const contract = new ethers.Contract(swapAddress, SwapABI.abi, provider);
  return await contract.getRate(tokenIn, tokenOut, amountIn);
}

export async function swapTokens(
  signer: ethers.Signer,
  tokenIn: string,
  tokenOut: string,
  amountIn: string
) {
  const contract = new ethers.Contract(swapAddress, SwapABI.abi, signer);
  const tx = await contract.swap(tokenIn, tokenOut, amountIn);
  return await tx.wait();
}