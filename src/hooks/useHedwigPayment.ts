import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { toast } from 'sonner';
import { ERC20_ABI } from '@/lib/abi/erc20';

// Token addresses
const USDC_ADDRESS: `0x${string}` = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC on Base Sepolia
const BASE_SEPOLIA_CHAIN_ID = 84532;

export interface PaymentRequest {
  amount: number; // Amount in human readable format (e.g., 100.50 for $100.50)
  freelancerAddress: `0x${string}`;
  invoiceId: string;
  tokenAddress?: `0x${string}`; // Defaults to USDC
}


export function useHedwigPayment() {
  const { address: accountAddress, isConnected } = useAccount();
  const { data: hash, writeContract, isPending: isConfirming, error } = useWriteContract();

  const { data: receipt, isLoading: isProcessing } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt) {
      toast.success('Payment successful!');
    }
    if (error) {
      toast.error(error.message || 'Transaction failed.');
    }
  }, [receipt, error]);

  const processPayment = useCallback(async (paymentRequest: PaymentRequest) => {
    try {
      if (!isConnected || !accountAddress) {
        toast.warning('Please connect your wallet to continue.');
        return;
      }

      if (!paymentRequest.amount || Number.isNaN(paymentRequest.amount) || paymentRequest.amount <= 0) {
        toast.error('Invalid payment amount.');
        return;
      }

      // Validate freelancer address
      const addr = paymentRequest.freelancerAddress as string;
      if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        toast.error('Freelancer wallet address is missing or invalid.');
        return;
      }

      const tokenAddress = paymentRequest.tokenAddress || USDC_ADDRESS;
      const amountInUnits = parseUnits(paymentRequest.amount.toString(), 6); // Assuming 6 decimals for USDC

      // Rely on wallet to prompt for network switch based on chainId below

      toast.info('Please confirm the USDC transfer in your wallet.');
      await writeContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [
          paymentRequest.freelancerAddress,
          amountInUnits,
        ],
        chainId: BASE_SEPOLIA_CHAIN_ID,
      });
    } catch (err: any) {
      console.error('Payment initiation failed:', err);
      toast.error(err?.message || 'Failed to initiate payment.');
    }
  }, [writeContract, isConnected, accountAddress]);

  return {
    processPayment,
    isProcessing,
    isConfirming,
    hash,
    receipt,
    error,
    usdcAddress: USDC_ADDRESS
  };
}