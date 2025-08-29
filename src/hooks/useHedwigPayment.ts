import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';
import { toast } from 'sonner';
import { config } from '../lib/wagmi';

// Complete ABI for the HedwigPayment contract
const HEDWIG_PAYMENT_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_platformWallet', type: 'address', internalType: 'address' },
      { name: '_usdcAddress', type: 'address', internalType: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'BASIS_POINTS',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MAX_PLATFORM_FEE',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'USDC',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'VERSION',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'calculateFee',
    inputs: [{ name: '_amount', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'fee', type: 'uint256', internalType: 'uint256' },
      { name: 'freelancerPayout', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'emergencyWithdraw',
    inputs: [
      { name: '_token', type: 'address', internalType: 'address' },
      { name: '_amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'emergencyWithdrawEnabled',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'enableEmergencyWithdraw',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getContractBalance',
    inputs: [{ name: '_token', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getFreelancerStats',
    inputs: [{ name: '_freelancer', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPayerStats',
    inputs: [{ name: '_payer', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isInvoiceProcessed',
    inputs: [{ name: '_invoiceId', type: 'string', internalType: 'string' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isTokenWhitelisted',
    inputs: [{ name: '_token', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'paused',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pay',
    inputs: [
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'freelancer', type: 'address', internalType: 'address' },
      { name: 'invoiceId', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'payDirect',
    inputs: [
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'freelancer', type: 'address', internalType: 'address' },
      { name: 'invoiceId', type: 'string', internalType: 'string' },
      { name: 'payer', type: 'address', internalType: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'platformFee',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'platformWallet',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'processedInvoices',
    inputs: [{ name: '', type: 'string', internalType: 'string' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPlatformFee',
    inputs: [{ name: '_newFee', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPlatformWallet',
    inputs: [{ name: '_newWallet', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTokenWhitelist',
    inputs: [
      { name: '_token', type: 'address', internalType: 'address' },
      { name: '_status', type: 'bool', internalType: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'totalPaymentsReceived',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalPaymentsSent',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'version',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'whitelistedTokens',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ContractPaused',
    inputs: [{ name: 'by', type: 'address', indexed: true, internalType: 'address' }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ContractUnpaused',
    inputs: [{ name: 'by', type: 'address', indexed: true, internalType: 'address' }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EmergencyWithdrawExecuted',
    inputs: [
      { name: 'token', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true, internalType: 'address' },
      { name: 'newOwner', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Paused',
    inputs: [{ name: 'account', type: 'address', indexed: false, internalType: 'address' }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PaymentReceived',
    inputs: [
      { name: 'payer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'freelancer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'token', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'fee', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'freelancerPayout', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'invoiceId', type: 'string', indexed: false, internalType: 'string' },
      { name: 'timestamp', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PlatformFeeUpdated',
    inputs: [
      { name: 'oldFee', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'newFee', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PlatformWalletUpdated',
    inputs: [
      { name: 'oldWallet', type: 'address', indexed: false, internalType: 'address' },
      { name: 'newWallet', type: 'address', indexed: false, internalType: 'address' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokenWhitelistUpdated',
    inputs: [
      { name: 'token', type: 'address', indexed: true, internalType: 'address' },
      { name: 'status', type: 'bool', indexed: false, internalType: 'bool' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Unpaused',
    inputs: [{ name: 'account', type: 'address', indexed: false, internalType: 'address' }],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'EmergencyWithdrawNotEnabled',
    inputs: [],
  },
  {
    type: 'error',
    name: 'EnforcedPause',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExpectedPause',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InsufficientAllowance',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvoiceAlreadyProcessed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ReentrancyGuardReentrantCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [{ name: 'token', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'TokenNotWhitelisted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TransferFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroBalance',
    inputs: [],
  },
] as const;

const HEDWIG_PAYMENT_CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET ||
  process.env.NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS ||
  '0x1c0A0eFBb438cc7705b947644F6AB88698b2704F' // Fallback to deployed contract address
) as `0x${string}`;
const BASE_MAINNET_CHAIN_ID = 8453;
const USDC_CONTRACT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`; // Base Mainnet USDC

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
  paymentLinkId?: string; // Optional payment link ID for payment link payments
}

export function useHedwigPayment() {
  const { address: accountAddress, isConnected } = useAccount();
  const { data: hash, writeContractAsync, isPending: isConfirming, error } = useWriteContract();
  const [isInitialized, setIsInitialized] = useState(false);
  
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
    chainId: BASE_MAINNET_CHAIN_ID
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
    chainId: BASE_MAINNET_CHAIN_ID
        });
  
  // Check if USDC is whitelisted
  const { data: isUsdcWhitelisted } = useReadContract({
    address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
    abi: [{
      "inputs": [{"internalType": "address", "name": "_token", "type": "address"}],
      "name": "isTokenWhitelisted",
      "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'isTokenWhitelisted',
    args: [USDC_CONTRACT_ADDRESS],
    chainId: BASE_MAINNET_CHAIN_ID
      });
  
  // Check if contract is paused
  const { data: isPaused } = useReadContract({
    address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
    abi: [{
      "inputs": [],
      "name": "paused",
      "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'paused',
    chainId: BASE_MAINNET_CHAIN_ID
  });
  const [currentPaymentRequest, setCurrentPaymentRequest] = useState<PaymentRequest | null>(null);
  const [lastAction, setLastAction] = useState<'transfer' | 'pay' | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const { data: receipt, isLoading: isProcessing } = useWaitForTransactionReceipt({ hash });


  
  // Initialize and reset transaction state on component mount
  useEffect(() => {
    if (!isInitialized) {
      console.log('Initializing payment hook - resetting transaction state');
      setPaymentReceipt(null);
      setLastAction(null);
      setIsProcessingPayment(false);
      setIsInitialized(true);
    }
  }, [isInitialized, accountAddress]);
  
  // Verify contract deployment function
  const verifyContractDeployment = useCallback(async () => {
    try {
      const version = await readContract(config, {
        address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
        abi: HEDWIG_PAYMENT_ABI,
        functionName: 'version',
        chainId: BASE_MAINNET_CHAIN_ID,
      });
      console.log('Contract deployment verified. Version:', version);
    } catch (error) {
      console.error('Failed to verify contract deployment:', error);
    }
  }, []);

  // Log contract state for debugging
  useEffect(() => {
    if (contractVersion && platformWallet) {
      console.log('Contract initialized:', {
        version: contractVersion,
        platformWallet,
        contractAddress: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
        isUsdcWhitelisted,
        isPaused
      });
       
       // Additional contract state validation
       if (isPaused) {
         console.warn('Contract is currently paused');
       }
       if (!isUsdcWhitelisted) {
         console.warn('USDC is not whitelisted in the contract');
       }
       
       // Verify contract deployment
       verifyContractDeployment();
       
      setIsInitialized(true);
    }
  }, [contractVersion, platformWallet, isUsdcWhitelisted, isPaused, verifyContractDeployment]);
  
  // Read current USDC balance
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
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
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: !!accountAddress,
    },
  });
  
  // Function to check if invoice is already processed
  const checkInvoiceProcessed = useCallback(async (invoiceId: string): Promise<boolean> => {
    try {
      const result = await readContract(config, {
        address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
        abi: [{
          "inputs": [{"internalType": "string", "name": "_invoiceId", "type": "string"}],
          "name": "isInvoiceProcessed",
          "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
          "stateMutability": "view",
          "type": "function"
        }],
        functionName: 'isInvoiceProcessed',
        args: [invoiceId],
        chainId: BASE_MAINNET_CHAIN_ID
      });
      return result as boolean;
    } catch (error) {
      console.error('Error checking invoice status:', error);
      return false;
    }
  }, []);




  // Debug wallet connection and balance
  useEffect(() => {
    console.log('Wallet Debug Info:', {
      accountAddress,
      isConnected,
      usdcBalance: usdcBalance?.toString(),
      chainId: BASE_MAINNET_CHAIN_ID
    });
  }, [accountAddress, isConnected, usdcBalance]);

  // Handle transaction hash when it becomes available
  useEffect(() => {
    if (hash && lastAction === 'pay' && currentPaymentRequest) {
      console.log('Payment transaction hash received:', hash);
      toast.success('Payment submitted! Waiting for confirmation...');
      
      // Continue with the payment processing flow
      const continuePaymentProcessing = async () => {
        try {
          // Wait for transaction receipt
          const transactionReceipt = await waitForTransactionReceipt(config, {
            hash,
            chainId: BASE_MAINNET_CHAIN_ID,
          });
          
          console.log('Payment transaction confirmed:', transactionReceipt);
          setPaymentReceipt(transactionReceipt);
          
          // Update status to paid - use updateBackendStatus helper
          await updateBackendStatus(currentPaymentRequest.invoiceId, hash, currentPaymentRequest.paymentLinkId);
          
          toast.success('Payment completed successfully!');
          setIsProcessingPayment(false);
          setLastAction(null);
          setCurrentPaymentRequest(null);
          
        } catch (error: any) {
          console.error('Payment processing failed:', error);
          toast.error(`Payment failed: ${error.message}`);
          setIsProcessingPayment(false);
          setLastAction(null);
        }
      };
      
      continuePaymentProcessing();
    }
  }, [hash, lastAction, currentPaymentRequest]);

  // Ensure usdcBalance is properly handled as BigInt
  const safeUsdcBalance = usdcBalance !== undefined && usdcBalance !== null ? usdcBalance : BigInt(0);

  // Helper to update backend status after successful payment
  const updateBackendStatus = useCallback(async (invoiceId: string, transactionHash: string, paymentLinkId?: string) => {
    try {
      // If paymentLinkId is explicitly provided, update payment link
      if (paymentLinkId) {
        console.log('Updating payment link status for ID:', paymentLinkId);
        const paymentLinkResponse = await fetch(`/api/payment-links/${paymentLinkId}/status`, {
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
        return;
      }

      // Otherwise, try to update as invoice first
      console.log('Updating invoice status for ID:', invoiceId);
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

      // If invoice update failed, try as payment link (fallback for standalone payment links)
      console.log('Invoice update failed, trying as payment link for ID:', invoiceId);
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
        console.error('Failed to update both invoice and payment link status');
      }
    } catch (error) {
      console.error('Error updating backend status:', error);
    }
  }, []);

  // Only show payment success when the last action was 'pay'
  useEffect(() => {
    if (receipt && lastAction === 'pay') {
      setPaymentReceipt(receipt);
      // Reset state after successful payment
      setIsProcessingPayment(false); // Reset processing state
      toast.success('Payment successful!');
      
      // Update backend status after successful payment
      if (currentPaymentRequest) {
        updateBackendStatus(currentPaymentRequest.invoiceId, receipt.transactionHash, currentPaymentRequest.paymentLinkId);
      }
    }
    if (error) {
      toast.error(error.message || 'Transaction failed.');
      setIsProcessingPayment(false); // Reset processing state on error
    }
  }, [receipt, error, lastAction, currentPaymentRequest, updateBackendStatus]);

  // Helper to send the pay transaction
  const sendPay = useCallback(async (req: PaymentRequest) => {
    // Comprehensive amount validation
    console.log('Validating payment amount:', {
      originalAmount: req.amount,
      type: typeof req.amount,
      isNaN: Number.isNaN(req.amount),
      isFinite: Number.isFinite(req.amount)
    });
    
    // Check for undefined, null, or invalid amounts
    if (req.amount === undefined || req.amount === null || Number.isNaN(req.amount) || !Number.isFinite(req.amount)) {
      console.error('Invalid amount detected:', req.amount);
      toast.error('Invalid payment amount - please refresh the page and try again.');
      return;
    }
    
    // Ensure amount is positive and reasonable
    if (req.amount <= 0) {
      console.error('Amount must be positive:', req.amount);
      toast.error('Payment amount must be greater than zero.');
      return;
    }
    
    // Check for extremely small amounts that might indicate parsing errors
    if (req.amount < 0.000001) {
      console.error('Amount too small, likely a parsing error:', req.amount);
      toast.error('Payment amount is too small. Please check the amount and try again.');
      return;
    }
    
    const amountStr = req.amount.toString();
    console.log('Converting amount to string:', amountStr);

    let amountInUnits;
    try {
      amountInUnits = parseUnits(amountStr, 6); // USDC has 6 decimals
      console.log('Amount converted to units:', {
        original: req.amount,
        string: amountStr,
        units: amountInUnits.toString(),
        formatted: formatUnits(amountInUnits, 6)
      });
    } catch (parseError) {
      console.error('Error parsing amount to units:', parseError);
      toast.error('Invalid payment amount format.');
      return;
    }
    
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
      chainId: BASE_MAINNET_CHAIN_ID,
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
    
    // Fetch fresh balance directly before payment
    if (!accountAddress) {
      toast.error("Wallet not connected");
      console.error("sendPay called without accountAddress");
      return;
    }

    let freshBalance;
    try {
      freshBalance = await readContract(config, {
          address: USDC_CONTRACT_ADDRESS,
          abi: [{
            "inputs": [{"name": "account", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
          }],
          functionName: 'balanceOf',
          args: [accountAddress],
          chainId: BASE_MAINNET_CHAIN_ID,
      });
      console.log('Successfully fetched fresh balance:', freshBalance?.toString());
    } catch (error) {
      console.error('Error fetching fresh balance:', error);
      toast.error('Could not verify your USDC balance. Please try again.');
      return;
    }

    const safeUsdcBalance = freshBalance ?? BigInt(0);

    // Check USDC balance with detailed logging
    console.log('Balance comparison debug:', {
      freshlyFetchedBalance: safeUsdcBalance.toString(),
      amountInUnits: amountInUnits.toString(),
      comparison: safeUsdcBalance < amountInUnits,
      balanceFormatted: formatUnits(safeUsdcBalance, 6),
      requiredFormatted: formatUnits(amountInUnits, 6)
    });

    if (safeUsdcBalance < amountInUnits) {
      const balanceFormatted = formatUnits(safeUsdcBalance, 6);
      const requiredFormatted = formatUnits(amountInUnits, 6);
      console.error('Insufficient USDC balance:', {
        balance: balanceFormatted,
        required: requiredFormatted
      });
      toast.error(`Insufficient USDC balance. You have ${balanceFormatted} USDC but need ${requiredFormatted} USDC.`);
      return;
    }
    
    // Step 1: Check existing allowance and approve USDC allowance for the contract
    console.log('Starting USDC approval process:', {
      usdcContract: USDC_CONTRACT_ADDRESS,
      spender: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
      amount: amountInUnits.toString(),
      amountFormatted: formatUnits(amountInUnits, 6),
      userBalance: formatUnits(safeUsdcBalance, 6),
      chainId: BASE_MAINNET_CHAIN_ID
    });
    
    // Check current allowance
    let currentAllowance;
    try {
      const allowanceResult = await readContract(config, {
        address: USDC_CONTRACT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [accountAddress!, HEDWIG_PAYMENT_CONTRACT_ADDRESS],
        chainId: BASE_MAINNET_CHAIN_ID
      });
      currentAllowance = allowanceResult as bigint;
      console.log('Current USDC allowance:', {
        allowance: currentAllowance.toString(),
        formatted: formatUnits(currentAllowance, 6),
        required: formatUnits(amountInUnits, 6)
      });
    } catch (allowanceError) {
      console.error('Failed to check allowance:', allowanceError);
      currentAllowance = BigInt(0);
    }
    
    // Declare approveHash variable in the proper scope
    let approveHash: `0x${string}` | undefined;
    
    // If there's insufficient allowance, we need to approve
    if (currentAllowance < amountInUnits) {
      
      toast.info('Please approve USDC spending in your wallet.');
      setLastAction('transfer');
      try {
        approveHash = await writeContractAsync({
          address: USDC_CONTRACT_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [HEDWIG_PAYMENT_CONTRACT_ADDRESS, amountInUnits],
          chainId: BASE_MAINNET_CHAIN_ID,
          gas: 100000n
        });
        
        console.log('Approval transaction submitted:', approveHash);
      } catch (approveError: any) {
      console.error('USDC approval failed:', approveError);
      console.error('Approval error details:', {
        message: approveError?.message,
        code: approveError?.code,
        stack: approveError?.stack
      });
      toast.error(`USDC approval failed: ${approveError.message}`);
      throw approveError;
      }
    } else {
      console.log('Sufficient allowance already exists, skipping approval');
      toast.success('USDC allowance already sufficient!');
    }

     // Wait for approval transaction to be confirmed (skip if allowance was sufficient)
     if (approveHash) {
       console.log('Waiting for approval confirmation for hash:', approveHash);
       toast.info('Waiting for approval confirmation...');
        try {
          const approveReceipt = await waitForTransactionReceipt(config, {
            hash: approveHash,
            chainId: BASE_MAINNET_CHAIN_ID,
            timeout: 60000 // 60 second timeout
          });
          
          console.log('Approval receipt received:', {
            status: approveReceipt.status,
            blockNumber: approveReceipt.blockNumber,
            gasUsed: approveReceipt.gasUsed?.toString(),
            transactionHash: approveReceipt.transactionHash
          });
          
          if (approveReceipt.status !== 'success') {
            console.error('Approval transaction failed with status:', approveReceipt.status);
            throw new Error(`Approval transaction failed with status: ${approveReceipt.status}`);
          }
          
          toast.success('USDC approval confirmed!');
        } catch (waitError: any) {
          console.error('Approval confirmation failed:', waitError);
          console.error('Wait error details:', {
            message: waitError?.message,
            code: waitError?.code,
            name: waitError?.name,
            cause: waitError?.cause
          });
          
          if (waitError?.message?.includes('timeout')) {
            toast.error('Approval confirmation timed out. The transaction may still be processing. Please check your wallet and try again.');
          } else {
            toast.error(`Approval confirmation failed: ${waitError?.message || 'Unknown error'}`);
          }
          throw waitError;
        }
     } else {
       console.log('Skipping approval confirmation - allowance was already sufficient');
     }

     // Step 2: Call pay function on the contract (this will handle the transfer and fee distribution)
     toast.info('Please confirm the payment processing in your wallet.');
     setLastAction('pay');
     setCurrentPaymentRequest(req); // Set the current payment request for the useEffect to handle
     
     try {
       // Trigger the transaction
       writeContractAsync({
         address: HEDWIG_PAYMENT_CONTRACT_ADDRESS,
         abi: HEDWIG_PAYMENT_ABI,
         functionName: 'pay',
         args: [USDC_CONTRACT_ADDRESS, amountInUnits, req.freelancerAddress, req.invoiceId],
         chainId: BASE_MAINNET_CHAIN_ID,
         gas: 300000n // Increase gas limit to 300,000 for safety
       });
       
       console.log('Payment transaction triggered, waiting for hash...');
       toast.info('Payment transaction initiated...');
       
       // The transaction hash will be available in the `hash` variable from useWriteContract
       // We'll handle the hash in a useEffect that watches for changes to `hash`
       
     } catch (payError: any) {
       console.error('Payment processing failed:', payError);
       console.error('Pay error details:', {
         message: payError?.message,
         code: payError?.code,
         data: payError?.data,
         cause: payError?.cause
       });
       
       // Reset state on error
       setLastAction(null);
       setCurrentPaymentRequest(null);
       setIsProcessingPayment(false);
       
       // Handle specific contract errors
       if (payError?.message?.includes('TokenNotWhitelisted')) {
         toast.error('USDC token is not whitelisted for payments. Please contact support.');
       } else if (payError?.message?.includes('InvoiceAlreadyProcessed')) {
         toast.error('This invoice has already been processed.');
       } else if (payError?.message?.includes('InsufficientAllowance')) {
         toast.error('Insufficient token allowance. Please try the approval again.');
       } else if (payError?.message?.includes('EnforcedPause')) {
         toast.error('Payment contract is currently paused. Please try again later.');
       } else if (payError?.message?.includes('InvalidAddress')) {
         toast.error('Invalid freelancer address provided.');
       } else if (payError?.message?.includes('InvalidAmount')) {
         toast.error('Invalid payment amount provided.');
       } else if (payError?.message?.includes('simulation') || payError?.message?.includes('revert')) {
         toast.error('Payment processing simulation failed. This may be due to stale data. Please try refreshing the page and attempting the payment again.');
       } else if (payError?.message?.includes('User rejected') || payError?.code === 4001) {
         toast.warning('Payment processing was cancelled by user.');
       } else {
         toast.error(`Payment processing failed: ${payError?.message || 'Unknown error'}`);
       }
       throw payError;
     }
     
     // Transaction has been submitted, the useEffect will handle the rest
     return; // Exit here, let useEffect handle the transaction hash
   }, [writeContractAsync, accountAddress]);



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
      
      // Check if invoice is already processed
      const isProcessed = await checkInvoiceProcessed(paymentRequest.invoiceId);
      if (isProcessed) {
        toast.error('This invoice has already been processed.');
        return;
      }
      
      // Check contract state before proceeding
      if (isPaused) {
        toast.error('Payment contract is currently paused. Please try again later.');
        return;
      }
      
      if (!isUsdcWhitelisted) {
        toast.error('USDC is not whitelisted for payments. Please contact support.');
        return;
      }

      // Set current payment request for backend status update
      setCurrentPaymentRequest(paymentRequest);

      // Validate amount before converting to BigInt
      const amountStr = paymentRequest.amount.toString();
      if (!amountStr || amountStr === 'undefined' || amountStr === 'null') {
        toast.error('Invalid payment amount - cannot convert to blockchain format.');
        return;
      }

      let amountInUnits;
      try {
        amountInUnits = parseUnits(amountStr, 6); // USDC has 6 decimals
      } catch (parseError) {
        console.error('Error parsing amount:', parseError);
        toast.error('Invalid payment amount format.');
        return;
      }
      console.log('Payment details:', {
        amount: paymentRequest.amount,
        amountInUnits: amountInUnits.toString(),
        freelancer: paymentRequest.freelancerAddress,
        invoiceId: paymentRequest.invoiceId
      });

      // Direct payment without approval - proceed with payment
      console.log('Starting direct payment process...');
      setPaymentReceipt(null);
      await sendPay(paymentRequest);
    } catch (err: any) {
      console.error('Payment initiation failed:', err);
      toast.error(err?.message || 'Failed to initiate payment.');
    }
  }, [isConnected, accountAddress, sendPay]);

  const resetTransaction = useCallback(async (forceRefresh = false) => {
    console.log('Resetting transaction state...', { forceRefresh });
    setPaymentReceipt(null);
    setLastAction(null);
    setIsProcessingPayment(false);
    setCurrentPaymentRequest(null);
    

    
    toast.success('Transaction state reset. You can now retry the payment.');
  }, [accountAddress]);

  return {
    processPayment,
    isProcessing: isProcessing || isProcessingPayment,
    isConfirming,
    hash,
    receipt,
    error,
    paymentReceipt,
    resetTransaction,
    checkInvoiceProcessed,
    verifyContractDeployment,
    contractVersion,
    platformWallet,
    isUsdcWhitelisted,
    isPaused,
  };
}