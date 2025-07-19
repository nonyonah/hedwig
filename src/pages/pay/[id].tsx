import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon, DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { WalletIcon } from '@heroicons/react/24/solid';
import { Wallet, ConnectWallet } from '@coinbase/onchainkit/wallet';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSendTransaction } from 'wagmi';
import { parseEther, parseUnits, formatUnits } from 'viem';
import { base, mainnet } from 'wagmi/chains';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Token contract addresses for supported networks (Base and Ethereum only)
const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  'base': {
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  'ethereum': {
    'USDC': '0xA0b86a33E6441b8C0b8b2B4B3d4B3e4B3d4B3e4B',
  },
  // Commented out unsupported networks
  // 'polygon': {
  //   'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  //   'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  //   'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  //   'WETH': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
  // },
  // 'arbitrum': {
  //   'USDC': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  //   'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  //   'DAI': '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  //   'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
  // },
  // 'optimism': {
  //   'USDC': '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  //   'USDT': '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  //   'DAI': '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  //   'WETH': '0x4200000000000000000000000000000000000006'
  // }
};

interface PaymentData {
  id: string;
  amount: number;
  token: string;
  network: string;
  wallet_address: string;
  user_name: string;
  payment_reason: string;
  status: string;
  created_at: string;
  expires_at: string;
  transaction_hash?: string;
}

export default function PaymentPage() {
  const router = useRouter();
  const { id } = router.query;
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const { address, isConnected, chain } = useAccount();
  const { writeContract, data: contractHash, error: writeError, isPending: isContractPending } = useWriteContract();
  const { sendTransaction, data: ethHash, error: sendError, isPending: isSendPending } = useSendTransaction();
  
  // Use the appropriate hash based on transaction type
  const hash = contractHash || ethHash;
  const isPending = isContractPending || isSendPending;
  const transactionError = writeError || sendError;
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (id) {
      fetchPaymentData();
    }
  }, [id]);

  const fetchPaymentData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('payment_links')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        setError('Payment link not found');
        return;
      }

      // Check if payment link has expired
      if (new Date(data.expires_at) < new Date()) {
        setError('This payment link has expired');
        return;
      }

      // Check if already paid
      if (data.status === 'paid') {
        setError('This payment has already been completed');
        return;
      }

      // Validate supported networks and tokens
      if (!['base', 'ethereum'].includes(data.network)) {
        setError(`Network ${data.network} is not supported. Only Base and Ethereum are supported.`);
        return;
      }

      if (!['ETH', 'USDC'].includes(data.token)) {
        setError(`Token ${data.token} is not supported. Only ETH and USDC are supported.`);
        return;
      }

      setPaymentData(data);
    } catch (err) {
      setError('Failed to load payment data');
      console.error('Error fetching payment data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getChainId = (network: string): number => {
    const chainIds: Record<string, number> = {
      'ethereum': 1,
      'base': 8453,
    };
    return chainIds[network] || 8453; // Default to Base
  };

  const getChainFromNetwork = (network: string) => {
    switch (network) {
      case 'ethereum':
        return mainnet;
      case 'base':
        return base;
      default:
        return base;
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const processPayment = async () => {
    if (!paymentData || !address || !isConnected) return;

    try {
      setIsProcessing(true);
      setError(null);

      // Check if we're on the correct network
      const expectedChain = getChainFromNetwork(paymentData.network);
      if (chain?.id !== expectedChain.id) {
        try {
          await switchChain({ chainId: expectedChain.id });
        } catch (switchError) {
          setError(`Please switch to ${expectedChain.name} network`);
          return;
        }
      }

      console.log('Processing payment:', {
        amount: paymentData.amount,
        token: paymentData.token,
        network: paymentData.network,
        to: paymentData.wallet_address,
        from: address
      });

      if (paymentData.token === 'ETH') {
        // Native ETH transfer
        sendTransaction({
          to: paymentData.wallet_address as `0x${string}`,
          value: parseEther(paymentData.amount.toString()),
        });
      } else {
        // ERC-20 token transfer (USDC)
        const tokenAddress = TOKEN_ADDRESSES[paymentData.network]?.[paymentData.token];
        
        if (!tokenAddress) {
          throw new Error(`Token ${paymentData.token} not supported on ${paymentData.network}`);
        }

        // ERC-20 ABI for transfer function
        const erc20Abi = [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }
        ] as const;

        // USDC has 6 decimals
        const decimals = 6;
        const amountWei = parseUnits(paymentData.amount.toString(), decimals);

        writeContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [paymentData.wallet_address as `0x${string}`, amountWei],
        });
      }

    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash && paymentData) {
      updatePaymentStatus(hash);
    }
  }, [isConfirmed, hash, paymentData]);

  // Handle transaction errors
  useEffect(() => {
    if (transactionError) {
      setError(transactionError.message || 'Transaction failed');
      setIsProcessing(false);
    }
  }, [transactionError]);

  const updatePaymentStatus = async (transactionHash: string) => {
    try {
      const response = await fetch('/api/update-payment-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: paymentData!.id,
          transactionHash,
          status: 'paid'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update payment status');
      }

      // Update local state
      setPaymentData(prev => prev ? { ...prev, status: 'paid', transaction_hash: transactionHash } : null);
      setIsProcessing(false);
    } catch (err) {
      console.error('Error updating payment status:', err);
      setError('Payment sent but failed to update status. Please contact support.');
      setIsProcessing(false);
    }
  };

  const formatAmount = (amount: number, token: string) => {
    return `${amount.toLocaleString()} ${token}`;
  };

  const getNetworkDisplayName = (network: string) => {
    const networkNames: Record<string, string> = {
      'base': 'Base',
      'ethereum': 'Ethereum',
    };
    return networkNames[network] || network.charAt(0).toUpperCase() + network.slice(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 text-center mb-2">Payment Not Found</h1>
          <p className="text-sm text-gray-600 text-center">{error}</p>
        </div>
      </div>
    );
  }

  if (!paymentData) {
    return null;
  }

  if (paymentData.status === 'paid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full mb-4">
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 text-center mb-2">Payment Completed</h2>
          <p className="text-sm text-gray-600 text-center mb-4">This payment has been successfully processed.</p>
          {paymentData.transaction_hash && (
            <p className="text-xs text-gray-500 text-center font-mono">
              Transaction: {paymentData.transaction_hash.slice(0, 10)}...{paymentData.transaction_hash.slice(-8)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Request</h1>
          <p className="text-sm text-gray-600">Complete your payment below</p>
        </div>

        {/* Payment Summary Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="p-6">
            {/* Amount */}
            <div className="text-center mb-6">
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {formatAmount(paymentData.amount, paymentData.token)}
              </div>
              <div className="text-sm text-gray-600">
                on {getNetworkDisplayName(paymentData.network)}
              </div>
            </div>

            {/* Payment Details */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Sold by
                </label>
                <div className="text-sm font-medium text-gray-900">{paymentData.user_name}</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  For
                </label>
                <div className="text-sm text-gray-900">{paymentData.payment_reason}</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Network
                </label>
                <div className="text-sm text-gray-900">{getNetworkDisplayName(paymentData.network)}</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Recipient Address
                </label>
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <span className="text-sm font-mono text-gray-900 truncate mr-2">
                    {paymentData.wallet_address}
                  </span>
                  <button
                    onClick={() => copyToClipboard(paymentData.wallet_address)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {copied ? (
                      <CheckIcon className="w-4 h-4 text-green-600" />
                    ) : (
                      <DocumentDuplicateIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Action */}
        <div className="space-y-4">
          {!isConnected ? (
            <div className="w-full">
              <Wallet>
                <ConnectWallet className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">
                  <WalletIcon className="w-4 h-4 mr-2" />
                  Connect Wallet
                </ConnectWallet>
              </Wallet>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm font-medium text-green-800">Wallet Connected</span>
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
              
              <button
                onClick={processPayment}
                disabled={isProcessing || isPending || isConfirming}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing || isPending || isConfirming ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Processing Payment...'}
                  </>
                ) : (
                  `Pay ${formatAmount(paymentData.amount, paymentData.token)}`
                )}
              </button>

              {transactionError && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-800">
                    Error: {transactionError.message}
                  </p>
                </div>
              )}

              {hash && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    Transaction submitted: {hash.slice(0, 10)}...{hash.slice(-8)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-gray-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Secure Payment</p>
              <p className="text-xs text-gray-600">Your transaction is secured by blockchain technology. Always verify the recipient address before sending.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Powered by Hedwig • Secure crypto payments
          </p>
        </div>
      </div>
    </div>
  );
}