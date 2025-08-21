import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { toast } from 'sonner';
import { HEDWIG_PAYMENT_ABI } from '@/contracts/HedwigPaymentService';

const HEDWIG_PAYMENT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS as `0x${string}`;
const BASE_SEPOLIA_CHAIN_ID = 84532;

export interface PaymentRequest {
  amount: number; // Amount in human readable format (e.g., 100.50 for $100.50)
  freelancerAddress: `0x${string}`;
  invoiceId: string;
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

      const addr = paymentRequest.freelancerAddress as string;
      if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        toast.error('Freelancer wallet address is missing or invalid.');
        return;
      }

      const amountInUnits = parseUnits(paymentRequest.amount.toString(), 6); // Assuming 6 decimals for USDC

      toast.info('Please confirm the payment in your wallet.');
      await writeContract({
        address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
        abi: HEDWIG_PAYMENT_ABI,
        functionName: 'pay',
        args: [
          amountInUnits,
          paymentRequest.freelancerAddress,
          paymentRequest.invoiceId,
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
  };
}