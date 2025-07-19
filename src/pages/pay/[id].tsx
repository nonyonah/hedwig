import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon, DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { WalletIcon } from '@heroicons/react/24/solid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Token contract addresses for different networks
const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  'base': {
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    'DAI': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    'WETH': '0x4200000000000000000000000000000000000006'
  },
  'ethereum': {
    'USDC': '0xA0b86a33E6441b8C0b8b2B4B3d4B3e4B3d4B3e4B',
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  },
  'polygon': {
    'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    'WETH': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
  }
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
  const [walletConnected, setWalletConnected] = useState(false);
  const [userWalletAddress, setUserWalletAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState<any>(null);
  const [signer, setSigner] = useState<any>(null);

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
      'polygon': 137,
      'arbitrum': 42161,
      'optimism': 10
    };
    return chainIds[network] || 8453; // Default to Base
  };

  const addNetwork = async (network: string) => {
    const networkConfigs: Record<string, any> = {
      'base': {
        chainId: '0x2105',
        chainName: 'Base',
        nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.base.org'],
        blockExplorerUrls: ['https://basescan.org']
      },
      'polygon': {
        chainId: '0x89',
        chainName: 'Polygon',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com'],
        blockExplorerUrls: ['https://polygonscan.com']
      },
      'arbitrum': {
        chainId: '0xa4b1',
        chainName: 'Arbitrum One',
        nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://arbiscan.io']
      },
      'optimism': {
        chainId: '0xa',
        chainName: 'Optimism',
        nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.optimism.io'],
        blockExplorerUrls: ['https://optimistic.etherscan.io']
      }
    };

    const config = networkConfigs[network];
    if (config && window.ethereum) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [config],
      });
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

  const connectWallet = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      
      // Check if MetaMask or other wallet is available
      if (typeof window !== 'undefined' && window.ethereum) {
        // Use existing wallet provider (MetaMask, etc.)
        const provider = new (await import('ethers')).ethers.BrowserProvider(window.ethereum);
        
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Get signer
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        // Check if we're on the correct network
        const network = await provider.getNetwork();
        const expectedChainId = getChainId(paymentData?.network || 'base');
        
        if (Number(network.chainId) !== expectedChainId) {
          // Request network switch
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              // Network not added, add it
              await addNetwork(paymentData?.network || 'base');
            } else {
              throw switchError;
            }
          }
        }
        
        setProvider(provider);
        setSigner(signer);
        setUserWalletAddress(address);
        setWalletConnected(true);
        
      } else {
        // Fallback to Coinbase Wallet SDK
        const { Wallet } = await import('@coinbase/wallet-sdk');
        
        const wallet = new Wallet({
          appName: 'Hedwig Payment',
          appLogoUrl: 'https://hedwig.xyz/logo.png',
          darkMode: false
        });
        
        const provider = wallet.makeWeb3Provider();
        const ethersProvider = new (await import('ethers')).ethers.BrowserProvider(provider);
        
        // Request account access
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        
        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts found');
        }
        
        const signer = await ethersProvider.getSigner();
        const address = accounts[0];
        
        setProvider(ethersProvider);
        setSigner(signer);
        setUserWalletAddress(address);
        setWalletConnected(true);
      }
      
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsProcessing(false);
    }
  };

  const processPayment = async () => {
    if (!paymentData || !userWalletAddress || !signer) return;

    try {
      setIsProcessing(true);
      setError(null);
      
      console.log('Processing payment:', {
        amount: paymentData.amount,
        token: paymentData.token,
        network: paymentData.network,
        to: paymentData.wallet_address,
        from: userWalletAddress
      });

      let txHash: string;

      if (paymentData.token === 'ETH' || paymentData.token === 'MATIC' || paymentData.token === 'AVAX') {
        // Native token transfer
        const tx = await signer.sendTransaction({
          to: paymentData.wallet_address,
          value: (await import('ethers')).ethers.parseEther(paymentData.amount.toString()),
        });
        
        console.log('Transaction sent:', tx.hash);
        await tx.wait(); // Wait for confirmation
        txHash = tx.hash;
        
      } else {
        // ERC-20 token transfer
        const tokenAddress = TOKEN_ADDRESSES[paymentData.network]?.[paymentData.token];
        
        if (!tokenAddress) {
          throw new Error(`Token ${paymentData.token} not supported on ${paymentData.network}`);
        }
        
        // ERC-20 ABI for transfer function
        const erc20Abi = [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
          'function balanceOf(address owner) view returns (uint256)'
        ];
        
        const tokenContract = new (await import('ethers')).ethers.Contract(tokenAddress, erc20Abi, signer);
        
        // Get token decimals
        const decimals = await tokenContract.decimals();
        
        // Check balance
        const balance = await tokenContract.balanceOf(userWalletAddress);
        const amountWei = (await import('ethers')).ethers.parseUnits(paymentData.amount.toString(), decimals);
        
        if (balance < amountWei) {
          throw new Error(`Insufficient ${paymentData.token} balance`);
        }
        
        // Send token transfer transaction
        const tx = await tokenContract.transfer(paymentData.wallet_address, amountWei);
        
        console.log('Token transfer sent:', tx.hash);
        await tx.wait(); // Wait for confirmation
        txHash = tx.hash;
      }

      // Update payment status in database
      const response = await fetch('/api/update-payment-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: paymentData.id,
          transactionHash: txHash,
          status: 'paid'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update payment status');
      }

      // Refresh payment data to show success state
      await fetchPaymentData();
      
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
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
      'polygon': 'Polygon',
      'arbitrum': 'Arbitrum',
      'optimism': 'Optimism'
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
          {!walletConnected ? (
            <button
              onClick={connectWallet}
              disabled={isProcessing}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <WalletIcon className="w-4 h-4 mr-2" />
                  Connect Wallet
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm font-medium text-green-800">Wallet Connected</span>
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
              
              <button
                onClick={processPayment}
                disabled={isProcessing}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing Payment...
                  </>
                ) : (
                  `Pay ${formatAmount(paymentData.amount, paymentData.token)}`
                )}
              </button>
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