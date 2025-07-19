import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import { CheckCircleIcon, ExclamationTriangleIcon, DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { WalletIcon } from '@heroicons/react/24/solid';
import { Wallet, ConnectWallet } from '@coinbase/onchainkit/wallet';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useSendTransaction } from 'wagmi';
import { parseEther, parseUnits } from 'viem';
import { base, mainnet } from 'wagmi/chains';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white shadow-sm border border-gray-200">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Payment Not Found</h1>
            <p className="text-sm text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!paymentData) {
    return null;
  }

  if (paymentData.status === 'paid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white shadow-sm border border-gray-200">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full mb-4">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Payment Completed</h2>
            <p className="text-sm text-gray-600 mb-4">This payment has been successfully processed.</p>
            {paymentData.transaction_hash && (
              <p className="text-xs text-gray-500 font-mono">
                Transaction: {paymentData.transaction_hash.slice(0, 10)}...{paymentData.transaction_hash.slice(-8)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-8 md:mb-16">
        <h1 className="text-lg font-semibold text-black">albus.</h1>
      </div>

      {/* Payment Summary Card */}
      <div className="flex justify-center">
        <Card className="w-full max-w-md bg-white shadow-sm border border-gray-200">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-xl font-semibold text-gray-900">Payment Summary</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Payment Details */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Sold by</span>
                <span className="text-gray-900 text-sm font-medium">{formatAddress(paymentData.wallet_address)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">For</span>
                <span className="text-gray-900 text-sm font-medium">{paymentData.payment_reason}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Price</span>
                <span className="text-gray-900 text-sm font-medium">{formatAmount(paymentData.amount, paymentData.token)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Network</span>
                <span className="text-gray-900 text-sm font-medium">{getNetworkDisplayName(paymentData.network)}</span>
              </div>
            </div>

            {/* Recipient Address */}
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-sm text-gray-600 mb-2">Recipient Address</label>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border">
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

            {/* Payment Action */}
            <div className="pt-4">
              {!isConnected ? (
                <Wallet>
                  <ConnectWallet className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center transition-colors">
                    <WalletIcon className="w-4 h-4 mr-2" />
                    Connect Wallet
                  </ConnectWallet>
                </Wallet>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm font-medium text-green-800">Wallet Connected</span>
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  </div>
                  
                  <Button
                    onClick={processPayment}
                    disabled={isProcessing || isPending || isConfirming}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    size="lg"
                  >
                    {isProcessing || isPending || isConfirming ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Processing Payment...'}
                      </>
                    ) : (
                      'Pay with wallet'
                    )}
                  </Button>

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
          </CardContent>
        </Card>
      </div>

      {/* Security Notice */}
      <div className="flex justify-center mt-6">
        <div className="w-full max-w-md bg-gray-50 rounded-lg p-4 border">
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
      </div>

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-xs text-gray-500">
          Powered by Hedwig • Secure crypto payments
        </p>
      </div>
    </div>
  );
}