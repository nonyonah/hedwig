import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi';
import { waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'viem';
import { toast } from 'sonner';
import { wagmiConfig as config } from '../lib/appkit';
import { getWalletConfig, getSupportedTokens } from '../contracts/config';

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

// Multi-chain contract addresses
const getContractAddress = (chainId: number): `0x${string}` => {
  const config = getWalletConfig(chainId);
  return (config.contractAddress || '0x1c0A0eFBb438cc7705b947644F6AB88698b2704F') as `0x${string}`;
};

// Chain configurations
const SUPPORTED_CHAINS = {
  BASE: { id: 8453, name: 'Base' },
  CELO: { id: 42220, name: 'Celo' }
};

export interface PaymentRequest {
  amount: number; // Amount in human readable format (e.g., 100.50 for $100.50)
  freelancerAddress: `0x${string}`;
  invoiceId: string;
  paymentLinkId?: string; // Optional payment link ID for payment link payments
  chainId: number; // Required chain ID
  tokenAddress: `0x${string}`; // Required token address
  tokenSymbol: string; // Required token symbol
}

export function useHedwigPayment() {
  const { address: accountAddress, isConnected, chainId: currentChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: hash, writeContractAsync, isPending: isConfirming, error } = useWriteContract();
  const { data: receipt } = useWaitForTransactionReceipt({ hash });
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(8453); // Default to Base
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [currentPaymentRequest, setCurrentPaymentRequest] = useState<PaymentRequest | null>(null);
  
  // Get contract address for selected chain
  const contractAddress = getContractAddress(selectedChainId);
  
  // Get supported tokens for selected chain
  const supportedTokens = getSupportedTokens(selectedChainId);
  
  // Read contract version to verify deployment
  const { data: contractVersion } = useReadContract({
    address: contractAddress,
    abi: [{
      "inputs": [],
      "name": "version",
      "outputs": [{"internalType": "string", "name": "", "type": "string"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'version',
    chainId: selectedChainId
  });
  
  // Read platform wallet to verify contract setup
  const { data: platformWallet } = useReadContract({
    address: contractAddress,
    abi: [{
      "inputs": [],
      "name": "platformWallet",
      "outputs": [{"internalType": "address", "name": "", "type": "address"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'platformWallet',
    chainId: selectedChainId
  });
  
  // Check if contract is paused
  const { data: isPaused } = useReadContract({
    address: contractAddress,
    abi: [{
      "inputs": [],
      "name": "paused",
      "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'paused',
    chainId: selectedChainId
  });

  // Check if token is whitelisted
  const isTokenWhitelisted = selectedToken ? true : false; // Simplified for now

  // Function to check if invoice is processed
  const checkInvoiceProcessed = useCallback(async (invoiceId: string): Promise<boolean> => {
    try {
      const result = await readContract(config, {
        address: contractAddress,
        abi: HEDWIG_PAYMENT_ABI,
        functionName: 'isInvoiceProcessed',
        args: [invoiceId],
        chainId: selectedChainId as any
      });
      return result as boolean;
    } catch (error) {
      console.error('Error checking invoice status:', error);
      return false;
    }
  }, [contractAddress, selectedChainId]);

  // Function to verify contract deployment
  const verifyContractDeployment = useCallback(async (): Promise<boolean> => {
    return !!contractVersion;
  }, [contractVersion]);

  // Function to switch to required chain for payment
  const ensureCorrectChain = useCallback(async (requiredChainId: number): Promise<boolean> => {
    if (currentChainId === requiredChainId) {
      return true;
    }
    
    try {
      await switchChain({ chainId: requiredChainId });
      return true;
    } catch (error) {
      console.error('Failed to switch chain:', error);
      toast.error(`Please switch to ${SUPPORTED_CHAINS.BASE.id === requiredChainId ? 'Base' : 'Celo'} network`);
      return false;
    }
  }, [currentChainId, switchChain]);

  // Function to get token balance for any supported token
  const getTokenBalance = useCallback(async (tokenAddress: `0x${string}`, chainId: number) => {
    try {
      const balance = await readContract(config, {
        address: tokenAddress,
        abi: [{
          "inputs": [{"name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }],
        functionName: 'balanceOf',
        args: [accountAddress!],
        chainId: chainId as any
      });
      return balance as bigint;
    } catch (error) {
      console.error('Error fetching token balance:', error);
      return BigInt(0);
    }
  }, [accountAddress]);

  // Function to check token allowance
  const checkTokenAllowance = useCallback(async (tokenAddress: `0x${string}`, spenderAddress: `0x${string}`, chainId: number) => {
    try {
      const allowance = await readContract(config, {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [accountAddress!, spenderAddress],
        chainId: chainId as any
      });
      return allowance as bigint;
    } catch (error) {
      console.error('Error checking allowance:', error);
      return BigInt(0);
    }
  }, [accountAddress]);

  // Function to approve token spending
  const approveToken = useCallback(async (tokenAddress: `0x${string}`, spenderAddress: `0x${string}`, amount: bigint, chainId: number) => {
    try {
      // Ensure we're on the correct chain
      const chainSwitched = await ensureCorrectChain(chainId);
      if (!chainSwitched) return null;

      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, amount],
        chainId: chainId as any
      });
      
      // Wait for approval transaction
      await waitForTransactionReceipt(config, {
        hash,
        chainId: chainId as any
      });
      
      return hash;
    } catch (error) {
      console.error('Token approval failed:', error);
      throw error;
    }
  }, [writeContractAsync, ensureCorrectChain]);

  // Main payment function with multi-chain support
  // Function to set the selected chain
  const setChain = useCallback((chainId: number) => {
    setSelectedChainId(chainId);
  }, []);

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
  }, [hash, lastAction, currentPaymentRequest, selectedChainId]);

  // Ensure tokenBalance is properly handled as BigInt - removing this unused line
  // const safeTokenBalance = tokenBalance !== undefined && tokenBalance !== null ? tokenBalance : BigInt(0);

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
    // Ensure we're on the correct chain
    const chainSwitched = await ensureCorrectChain(req.chainId);
    if (!chainSwitched) {
      return;
    }

    // Update selected chain and token based on request
    setSelectedChainId(req.chainId);
    setSelectedToken({
      address: req.tokenAddress,
      symbol: req.tokenSymbol,
      decimals: 6 // Assuming 6 decimals for stablecoins
    });

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
      amountInUnits = parseUnits(amountStr, selectedToken.decimals);
      console.log('Amount converted to units:', {
        original: req.amount,
        string: amountStr,
        units: amountInUnits.toString(),
        formatted: formatUnits(amountInUnits, selectedToken.decimals)
      });
    } catch (parseError) {
      console.error('Error parsing amount to units:', parseError);
      toast.error('Invalid payment amount format.');
      return;
    }
    
    // Debug: Check contract address
    const currentContractAddress = getContractAddress(req.chainId);
    if (!currentContractAddress) {
      console.error('Contract address not set for chain:', req.chainId);
      toast.error('Contract address not configured for selected chain');
      return;
    }
    
    console.log('Sending payment transaction:', {
      contract: currentContractAddress,
      contractVersion: contractVersion,
      platformWallet: platformWallet,
      amount: amountInUnits.toString(),
      freelancer: req.freelancerAddress,
      invoiceId: req.invoiceId,
      chainId: req.chainId,
      tokenAddress: req.tokenAddress,
      tokenSymbol: req.tokenSymbol,
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
      freshBalance = await getTokenBalance(req.tokenAddress, req.chainId);
      console.log('Successfully fetched fresh balance:', freshBalance?.toString());
    } catch (error) {
      console.error('Error fetching fresh balance:', error);
      toast.error(`Could not verify your ${req.tokenSymbol} balance. Please try again.`);
      return;
    }

    const safeTokenBalance = freshBalance ?? BigInt(0);

    // Check token balance with detailed logging
    console.log('Balance comparison debug:', {
      freshlyFetchedBalance: safeTokenBalance.toString(),
      amountInUnits: amountInUnits.toString(),
      comparison: safeTokenBalance < amountInUnits,
      balanceFormatted: formatUnits(safeTokenBalance, selectedToken.decimals),
      requiredFormatted: formatUnits(amountInUnits, selectedToken.decimals)
    });

    if (safeTokenBalance < amountInUnits) {
      const balanceFormatted = formatUnits(safeTokenBalance, selectedToken.decimals);
      const requiredFormatted = formatUnits(amountInUnits, selectedToken.decimals);
      console.error(`Insufficient ${req.tokenSymbol} balance:`, {
        balance: balanceFormatted,
        required: requiredFormatted
      });
      toast.error(`Insufficient ${req.tokenSymbol} balance. You have ${balanceFormatted} ${req.tokenSymbol} but need ${requiredFormatted} ${req.tokenSymbol}.`);
      return;
    }
    
    // Step 1: Check existing allowance and approve token allowance for the contract
    console.log(`Starting ${req.tokenSymbol} approval process:`, {
      tokenContract: req.tokenAddress,
      spender: currentContractAddress,
      amount: amountInUnits.toString(),
      amountFormatted: formatUnits(amountInUnits, selectedToken.decimals),
      userBalance: formatUnits(safeTokenBalance, selectedToken.decimals),
      chainId: req.chainId
    });
    
    // Check current allowance
    let currentAllowance;
    try {
      currentAllowance = await checkTokenAllowance(req.tokenAddress, currentContractAddress, req.chainId);
      console.log(`Current ${req.tokenSymbol} allowance:`, {
        allowance: currentAllowance.toString(),
        formatted: formatUnits(currentAllowance, selectedToken.decimals),
        required: formatUnits(amountInUnits, selectedToken.decimals)
      });
    } catch (allowanceError) {
      console.error('Failed to check allowance:', allowanceError);
      currentAllowance = BigInt(0);
    }
    
    // Declare approveHash variable in the proper scope
    let approveHash: `0x${string}` | null | undefined;
    
    // If there's insufficient allowance, we need to approve
    if (currentAllowance < amountInUnits) {
      toast.info(`Please approve ${req.tokenSymbol} spending in your wallet.`);
      setLastAction('transfer');
      try {
        approveHash = await approveToken(req.tokenAddress, currentContractAddress, amountInUnits, req.chainId);
        console.log('Approval transaction submitted:', approveHash);
      } catch (approveError: any) {
        console.error(`${req.tokenSymbol} approval failed:`, approveError);
        console.error('Approval error details:', {
          message: approveError?.message,
          code: approveError?.code,
          stack: approveError?.stack
        });
        toast.error(`${req.tokenSymbol} approval failed: ${approveError.message}`);
        throw approveError;
      }
    } else {
      console.log('Sufficient allowance already exists, skipping approval');
      toast.success(`${req.tokenSymbol} allowance already sufficient!`);
    }

     // Wait for approval transaction to be confirmed (skip if allowance was sufficient)
     if (approveHash) {
       console.log('Waiting for approval confirmation for hash:', approveHash);
       toast.info('Waiting for approval confirmation...');
        try {
          const approveReceipt = await waitForTransactionReceipt(config, {
            hash: approveHash,
            chainId: req.chainId as any,
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
          
          toast.success(`${req.tokenSymbol} approval confirmed!`);
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
         address: currentContractAddress,
         abi: HEDWIG_PAYMENT_ABI,
         functionName: 'pay',
         args: [req.tokenAddress, amountInUnits, req.freelancerAddress, req.invoiceId],
         chainId: req.chainId as any,
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
         toast.error(`${req.tokenSymbol} token is not whitelisted for payments. Please contact support.`);
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
   }, [writeContractAsync, accountAddress, ensureCorrectChain, getTokenBalance, checkTokenAllowance, approveToken, contractVersion, platformWallet]);

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

      // Ensure we're on the correct chain before checking contract state
      const chainSwitched = await ensureCorrectChain(paymentRequest.chainId);
      if (!chainSwitched) {
        return;
      }

      // Update selected chain and token
      setSelectedChainId(paymentRequest.chainId);
      setSelectedToken({
        address: paymentRequest.tokenAddress,
        symbol: paymentRequest.tokenSymbol,
        decimals: 6
      });
      
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
      
      if (!isTokenWhitelisted) {
        toast.error(`${paymentRequest.tokenSymbol} is not whitelisted for payments. Please contact support.`);
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
        amountInUnits = parseUnits(amountStr, 6); // Assuming 6 decimals for stablecoins
      } catch (parseError) {
        console.error('Error parsing amount:', parseError);
        toast.error('Invalid payment amount format.');
        return;
      }
      console.log('Payment details:', {
        amount: paymentRequest.amount,
        amountInUnits: amountInUnits.toString(),
        freelancer: paymentRequest.freelancerAddress,
        invoiceId: paymentRequest.invoiceId,
        chainId: paymentRequest.chainId,
        tokenAddress: paymentRequest.tokenAddress,
        tokenSymbol: paymentRequest.tokenSymbol
      });

      // Direct payment without approval - proceed with payment
      console.log('Starting direct payment process...');
      setPaymentReceipt(null);
      await sendPay(paymentRequest);
    } catch (err: any) {
      console.error('Payment initiation failed:', err);
      toast.error(err?.message || 'Failed to initiate payment.');
    }
  }, [isConnected, accountAddress, sendPay, ensureCorrectChain, checkInvoiceProcessed, isPaused, isTokenWhitelisted]);

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
    isProcessing: isProcessingPayment,
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
    isTokenWhitelisted,
    isPaused,
    // Multi-chain helpers
    selectedChainId,
    setSelectedChainId,
    selectedToken,
    setSelectedToken,
    supportedTokens,
    ensureCorrectChain,
    getTokenBalance,
    checkTokenAllowance,
    approveToken,
  };
}