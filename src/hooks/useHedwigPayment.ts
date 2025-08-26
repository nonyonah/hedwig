import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { toast } from 'sonner';

// Correct ABI for the HedwigPayment contract
const HEDWIG_PAYMENT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "freelancer",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "invoiceId",
        "type": "string"
      }
    ],
    "name": "pay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "USDC",
    "outputs": [{
      "internalType": "address",
      "name": "",
      "type": "address"
    }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientAllowance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "Unauthorized",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TokenNotWhitelisted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvoiceAlreadyProcessed",
    "type": "error"
  }
];

const HEDWIG_PAYMENT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS as `0x${string}`;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const USDC_CONTRACT_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`; // Base Sepolia USDC Testnet (correct)

// ERC20 ABI for approve function
const ERC20_ABI = [
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export interface PaymentRequest {
  amount: number; // Amount in human readable format (e.g., 100.50 for $100.50)
  freelancerAddress: `0x${string}`;
  invoiceId: string;
}

export function useHedwigPayment() {
  const { address: accountAddress, isConnected } = useAccount();
  const { data: hash, writeContract, isPending: isConfirming, error } = useWriteContract();
  const [isApproving, setIsApproving] = useState(false);
  
  // Read contract version to verify deployment
  const { data: contractVersion } = useReadContract({
    address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
    abi: [{
      "inputs": [],
      "name": "version",
      "outputs": [{"internalType": "string", "name": "", "type": "string"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'version',
    chainId: BASE_SEPOLIA_CHAIN_ID
  });
  
  // Read platform wallet to verify contract setup
  const { data: platformWallet } = useReadContract({
    address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
    abi: [{
      "inputs": [],
      "name": "platformWallet",
      "outputs": [{"internalType": "address", "name": "", "type": "address"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'platformWallet',
    chainId: BASE_SEPOLIA_CHAIN_ID
  });
  const [pendingPaymentRequest, setPendingPaymentRequest] = useState<PaymentRequest | null>(null);
  const [currentPaymentRequest, setCurrentPaymentRequest] = useState<PaymentRequest | null>(null);
  const [lastAction, setLastAction] = useState<'approve' | 'pay' | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<any>(null);
  const [approvalCompleted, setApprovalCompleted] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const { data: receipt, isLoading: isProcessing } = useWaitForTransactionReceipt({ hash });
  
  // Check current USDC allowance
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_CONTRACT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: accountAddress && HEDWIG_PAYMENT_CONTRACT_ADDRESS ? [accountAddress, HEDWIG_PAYMENT_CONTRACT_ADDRESS] : undefined
  });
  
  // Read current USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_CONTRACT_ADDRESS,
    abi: [{
      "inputs": [{"name": "account", "type": "address"}],
      "name": "balanceOf",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'balanceOf',
    args: accountAddress ? [accountAddress] : undefined,
    chainId: BASE_SEPOLIA_CHAIN_ID
  });

  // Helper to update backend status after successful payment
  const updateBackendStatus = useCallback(async (invoiceId: string, transactionHash: string) => {
    try {
      // Try to update as invoice first
      const invoiceResponse = await fetch(`/api/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'completed',
          transactionHash: transactionHash,
        }),
      });

      if (invoiceResponse.ok) {
        console.log('Invoice status updated successfully');
        return;
      }

      // If invoice update fails, try payment link
      const paymentLinkResponse = await fetch(`/api/payment-links/${invoiceId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'paid',
          transactionHash: transactionHash,
        }),
      });

      if (paymentLinkResponse.ok) {
        console.log('Payment link status updated successfully');
      } else {
        console.error('Failed to update payment link status');
      }
    } catch (error) {
      console.error('Error updating backend status:', error);
    }
  }, []);

  // Only show payment success when the last action was 'pay'
  useEffect(() => {
    if (receipt && lastAction === 'pay') {
      setPaymentReceipt(receipt);
      setApprovalCompleted(false); // Reset approval state after successful payment
      setIsProcessingPayment(false); // Reset processing state
      toast.success('Payment successful!');
      
      // Update backend status after successful payment
      if (currentPaymentRequest) {
        updateBackendStatus(currentPaymentRequest.invoiceId, receipt.transactionHash);
      }
    }
    if (error) {
      toast.error(error.message || 'Transaction failed.');
      setIsProcessingPayment(false); // Reset processing state on error
    }
  }, [receipt, error, lastAction, currentPaymentRequest, updateBackendStatus]);

  // Helper to send the pay transaction
  const sendPay = useCallback(async (req: PaymentRequest) => {
    const amountInUnits = parseUnits(req.amount.toString(), 6); // USDC has 6 decimals
    
    // Debug: Check contract address
    if (!HEDWIG_PAYMENT_CONTRACT_ADDRESS) {
      console.error('Contract address not set!');
      toast.error('Contract address not configured');
      return;
    }
    
    console.log('Sending payment transaction:', {
      contract: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
      contractVersion: contractVersion,
      platformWallet: platformWallet,
      amount: amountInUnits.toString(),
      freelancer: req.freelancerAddress,
      invoiceId: req.invoiceId,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      userAddress: accountAddress
    });
    
    // Verify contract is accessible
    if (!contractVersion) {
      console.error('Cannot read from contract - it may not be deployed or accessible');
      toast.error('Contract not accessible. Please check network connection.');
      return;
    }
    
    // Verify platform wallet is set
    if (!platformWallet || platformWallet === '0x0000000000000000000000000000000000000000') {
      console.error('Platform wallet not set in contract');
      toast.error('Contract configuration error: Platform wallet not set.');
      return;
    }
    
    // Check USDC balance
    if (usdcBalance && usdcBalance < amountInUnits) {
      const balanceFormatted = formatUnits(usdcBalance, 6);
      const requiredFormatted = formatUnits(amountInUnits, 6);
      console.error('Insufficient USDC balance:', {
        balance: balanceFormatted,
        required: requiredFormatted
      });
      toast.error(`Insufficient USDC balance. You have ${balanceFormatted} USDC but need ${requiredFormatted} USDC.`);
      return;
    }
    
    // Check USDC allowance
    console.log('Current allowance check:', {
      currentAllowance: currentAllowance?.toString(),
      amountInUnits: amountInUnits.toString(),
      hasAllowance: currentAllowance ? currentAllowance >= amountInUnits : false
    });
    
    if (currentAllowance && currentAllowance < amountInUnits) {
      const allowanceFormatted = formatUnits(currentAllowance, 6);
      const requiredFormatted = formatUnits(amountInUnits, 6);
      console.error('Insufficient USDC allowance:', {
        allowance: allowanceFormatted,
        required: requiredFormatted
      });
      toast.error(`Insufficient USDC allowance. Please approve ${requiredFormatted} USDC first.`);
      return;
    }
    
    
    toast.info('Please confirm the payment in your wallet.');
    setLastAction('pay');
    try {
      await writeContract({
        address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
        abi: HEDWIG_PAYMENT_ABI,
        functionName: 'pay',
        args: [USDC_CONTRACT_ADDRESS, amountInUnits, req.freelancerAddress, req.invoiceId],
        chainId: BASE_SEPOLIA_CHAIN_ID,
        gas: 300000n // Increase gas limit to 300,000 for safety
      });
    } catch (payError: any) {
      console.error('Payment transaction failed:', payError);
      console.error('Error details:', {
        message: payError?.message,
        code: payError?.code,
        data: payError?.data,
        cause: payError?.cause
      });
      toast.error(`Payment failed: ${payError?.message || 'Unknown error'}`);
      throw payError;
    }
  }, [writeContract, accountAddress]);

  // After approval confirmation, set state to show 'Continue' button
  useEffect(() => {
    if (receipt && isApproving && lastAction === 'approve') {
      toast.success('USDC approval confirmed! Click Continue to complete payment.');
      setIsApproving(false);
      setApprovalCompleted(true);
      refetchAllowance();
    }
  }, [receipt, isApproving, lastAction, refetchAllowance]);

  // Reset isConfirming state after approval is completed
  useEffect(() => {
    if (approvalCompleted && lastAction === 'approve') {
      // Reset the last action to clear the isConfirming state
      setLastAction(null);
    }
  }, [approvalCompleted, lastAction]);

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

      // Set current payment request for backend status update
      setCurrentPaymentRequest(paymentRequest);

      const amountInUnits = parseUnits(paymentRequest.amount.toString(), 6); // USDC has 6 decimals
      console.log('Payment details:', {
        amount: paymentRequest.amount,
        amountInUnits: amountInUnits.toString(),
        freelancer: paymentRequest.freelancerAddress,
        invoiceId: paymentRequest.invoiceId
      });

      // Check if we need to approve USDC spending
      // Note: The contract takes the full amount and deducts 1% fee internally
      const currentAllowanceValue = (currentAllowance as bigint) || 0n;
      console.log('Allowance check:', {
        currentAllowance: currentAllowanceValue.toString(),
        requiredAmount: amountInUnits.toString(),
        needsApproval: currentAllowanceValue < amountInUnits
      });
      
      if (currentAllowanceValue < amountInUnits) {
        setIsApproving(true);
        setPendingPaymentRequest(paymentRequest);
        toast.info(`Approving ${paymentRequest.amount} USDC spending...`);
        try {
          setLastAction('approve');
          // Approve the full payment amount (contract handles fee deduction internally)
          writeContract({
            address: USDC_CONTRACT_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [HEDWIG_PAYMENT_CONTRACT_ADDRESS, amountInUnits],
            chainId: BASE_SEPOLIA_CHAIN_ID,
            gas: 100000n // Set gas limit to 100,000 for USDC approval
          });
          // Wait for approval receipt; payment will auto-continue in the approval effect
          return;
        } catch (approvalError: any) {
          setIsApproving(false);
          setPendingPaymentRequest(null);
          console.error('USDC approval failed:', approvalError);
          toast.error(`USDC approval failed: ${approvalError?.message || 'Unknown error'}`);
          return;
        }
      }

      // No approval needed, go straight to pay
      console.log('Sufficient allowance, proceeding with payment...');
      setPaymentReceipt(null);
      await sendPay(paymentRequest);
    } catch (err: any) {
      console.error('Payment initiation failed:', err);
      toast.error(err?.message || 'Failed to initiate payment.');
    }
  }, [writeContract, isConnected, accountAddress, currentAllowance, sendPay]);

  const resetTransaction = useCallback(() => {
    console.log('Resetting transaction state...');
    setIsApproving(false);
    setApprovalCompleted(false);
    setPaymentReceipt(null);
    setPendingPaymentRequest(null);
    setLastAction(null);
    setIsProcessingPayment(false);
    toast.success('Transaction state reset. You can now retry the payment.');
  }, []);

  return {
    processPayment,
    isProcessing: isProcessing || isProcessingPayment,
    isConfirming: isConfirming || isApproving,
    hash,
    receipt,
    error,
    isApproving,
    paymentReceipt,
    approvalCompleted,
    pendingPaymentRequest,
    continuePendingPayment: useCallback(async () => {
      if (pendingPaymentRequest && !isProcessingPayment) {
        setIsProcessingPayment(true);
        setPaymentReceipt(null);
        try {
          await sendPay(pendingPaymentRequest);
          setPendingPaymentRequest(null);
        } catch (error) {
          console.error('Continue payment failed:', error);
          setIsProcessingPayment(false);
        }
      }
    }, [pendingPaymentRequest, isProcessingPayment, sendPay]),
    resetTransaction,
  };
}