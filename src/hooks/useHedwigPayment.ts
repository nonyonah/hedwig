import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { toast } from 'sonner';

// Contract ABI for the payment function
const HEDWIG_PAYMENT_ABI = [
  "function pay(address token, uint256 amount, address freelancer, string calldata invoiceId) external",
  "function isTokenWhitelisted(address token) external view returns (bool)",
  "function calculateFee(uint256 amount) external view returns (uint256 fee, uint256 freelancerPayout)",
  "event PaymentReceived(address indexed payer, address indexed freelancer, address indexed token, uint256 amount, uint256 fee, string invoiceId)"
];

// ERC20 ABI for token operations
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

// Contract and token addresses
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET || '';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC on Base Sepolia
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

export interface PaymentRequest {
  amount: number; // Amount in human readable format (e.g., 100.50 for $100.50)
  freelancerAddress: string;
  invoiceId: string;
  tokenAddress?: string; // Defaults to USDC
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export function useHedwigPayment() {
  const { wallets } = useWallets();
  const [isProcessing, setIsProcessing] = useState(false);

  const processPayment = useCallback(async (paymentRequest: PaymentRequest): Promise<PaymentResult> => {
    if (!wallets.length) {
      return { success: false, error: 'No wallet connected' };
    }

    if (!CONTRACT_ADDRESS) {
      return { success: false, error: 'Contract address not configured' };
    }

    const wallet = wallets[0];
    setIsProcessing(true);

    try {
      // Get Ethereum provider from Privy wallet
      const provider = await wallet.getEthereumProvider();
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      // Contract instances
      const tokenAddress = paymentRequest.tokenAddress || USDC_ADDRESS;
      const hedwigContract = new ethers.Contract(CONTRACT_ADDRESS, HEDWIG_PAYMENT_ABI, signer);
      let tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      // Get token decimals
      let decimals: number;
try {
  decimals = await tokenContract.decimals();
  if (typeof decimals !== 'number' || isNaN(decimals)) throw new Error('Could not fetch token decimals');
} catch (e: any) {
  // If BAD_DATA or undefined, try again with signer directly
  if (e.code === 'BAD_DATA' || (e.message && e.message.includes('Could not fetch token decimals'))) {
    try {
      const fallbackSigner = await signer;
      tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, fallbackSigner);
      decimals = await tokenContract.decimals();
      if (typeof decimals !== 'number' || isNaN(decimals)) throw new Error('Fallback: Could not fetch token decimals');
    } catch (e2: any) {
      console.warn('Fallback decimals also failed, defaulting to 6. Error:', e2);
      decimals = 6; // Default for USDC-like tokens
    }
  } else {
    console.error('Error fetching token decimals:', e);
    decimals = 6;
  }
}
const amountInWei = ethers.parseUnits(paymentRequest.amount.toString(), decimals);

      // Check if token is whitelisted
      const isWhitelisted = await hedwigContract.isTokenWhitelisted(tokenAddress);
      if (!isWhitelisted) {
        return { success: false, error: 'Token is not whitelisted for payments' };
      }

      // Check user's token balance
      const userAddress = await signer.getAddress();
      let balance;
try {
  balance = await tokenContract.balanceOf(userAddress);
  if (!balance || balance.toString() === '0x' || balance.toString() === '0') {
    balance = 0n;
  }
} catch (e: any) {
  console.error('Error fetching token balance:', e);
  return { success: false, error: 'Could not fetch token balance.' };
}
if (balance < amountInWei) {
        const balanceFormatted = ethers.formatUnits(balance, decimals);
        return { 
          success: false, 
          error: `Insufficient balance. You have ${balanceFormatted} USDC, but need ${paymentRequest.amount} USDC` 
        };
      }

      // Check and approve token allowance
      let currentAllowance;
try {
  currentAllowance = await tokenContract.allowance(userAddress, CONTRACT_ADDRESS);
  if (!currentAllowance || currentAllowance.toString() === '0x' || currentAllowance.toString() === '0') {
    currentAllowance = 0n;
  }
} catch (e: any) {
  console.error('Error fetching token allowance:', e);
  return { success: false, error: 'Could not fetch token allowance.' };
}
if (currentAllowance < amountInWei) {
        toast.info('Approving token spending...');
        const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, amountInWei);
        await approveTx.wait();
        toast.success('Token spending approved!');
      }

      // Calculate fees for display
      const [fee, freelancerPayout] = await hedwigContract.calculateFee(amountInWei);
      const feeFormatted = ethers.formatUnits(fee, decimals);
      const payoutFormatted = ethers.formatUnits(freelancerPayout, decimals);

      toast.info(`Processing payment: ${payoutFormatted} USDC to freelancer + ${feeFormatted} USDC platform fee`);

      // Execute payment through smart contract
      const paymentTx = await hedwigContract.pay(
        tokenAddress,
        amountInWei,
        paymentRequest.freelancerAddress,
        paymentRequest.invoiceId
      );

      toast.info('Payment transaction submitted. Waiting for confirmation...');
      const receipt = await paymentTx.wait();

      return {
        success: true,
        transactionHash: receipt.hash
      };

    } catch (error: any) {
      console.error('Payment error:', error);
      
      // Handle specific error cases
      if (error.code === 'ACTION_REJECTED') {
        return { success: false, error: 'Transaction was rejected by user' };
      } else if (error.message?.includes('insufficient funds')) {
        return { success: false, error: 'Insufficient funds for gas fees' };
      } else if (error.message?.includes('Token is not whitelisted')) {
        return { success: false, error: 'Token is not whitelisted for payments' };
      }
      
      return { 
        success: false, 
        error: error.message || 'Payment failed. Please try again.' 
      };
    } finally {
      setIsProcessing(false);
    }
  }, [wallets]);

  const checkTokenBalance = useCallback(async (tokenAddress: string = USDC_ADDRESS): Promise<{ balance: string; decimals: number } | null> => {
    if (!wallets.length) return null;

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();
      const userAddress = await signer.getAddress();

      let tokenContract;
let balance;
try {
  // Prefer using the signer if available for balanceOf
  if (ethersProvider.getSigner) {
    tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, await ethersProvider.getSigner());
  } else {
    tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, ethersProvider);
  }
  balance = await tokenContract.balanceOf(userAddress);
  if (!balance || balance.toString() === '0x' || balance.toString() === '0') {
    balance = 0n;
  }
} catch (e: any) {
  // If BAD_DATA, try again with signer directly
  if (e.code === 'BAD_DATA' || (e.message && e.message.includes('could not decode result data'))) {
    try {
      const fallbackSigner = await ethersProvider.getSigner();
      tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, fallbackSigner);
      balance = await tokenContract.balanceOf(userAddress);
      if (!balance || balance.toString() === '0x' || balance.toString() === '0') {
        balance = 0n;
      }
    } catch (e2: any) {
      console.warn('Fallback balanceOf also failed, returning 0. Error:', e2);
      return { balance: '0', decimals: 6 };
    }
  } else {
    console.error('Error fetching token balance:', e);
    return null;
  }
}
let decimals: number;
try {
  decimals = await tokenContract.decimals();
  if (typeof decimals !== 'number' || isNaN(decimals)) throw new Error('Could not fetch token decimals');
} catch (e: any) {
  // If BAD_DATA or undefined, try again with signer directly
  if (e.code === 'BAD_DATA' || (e.message && e.message.includes('Could not fetch token decimals'))) {
    try {
      const fallbackSigner = await ethersProvider.getSigner();
      tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, fallbackSigner);
      decimals = await tokenContract.decimals();
      if (typeof decimals !== 'number' || isNaN(decimals)) throw new Error('Fallback: Could not fetch token decimals');
    } catch (e2: any) {
      console.warn('Fallback decimals also failed, defaulting to 6. Error:', e2);
      decimals = 6; // Default for USDC-like tokens
    }
  } else {
    console.error('Error fetching token decimals:', e);
    decimals = 6;
  }
}

return {
  balance: ethers.formatUnits(balance, decimals),
  decimals
};
    } catch (error) {
      console.error('Error checking balance:', error);
      return null;
    }
  }, [wallets]);

  return {
    processPayment,
    checkTokenBalance,
    isProcessing,
    contractAddress: CONTRACT_ADDRESS,
    usdcAddress: USDC_ADDRESS
  };
}