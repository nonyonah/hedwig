import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance, useSwitchChain, useWriteContract, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, parseUnits, formatEther } from 'viem'
import { base } from 'viem/chains'
import { useState, useEffect } from 'react'
import { formatAddress, formatBalance } from '@/lib/utils'

interface PaymentData {
  id: string
  recipient: string
  amount: string
  currency: string
  description: string
  network: string
  token_address?: string
  reason?: string
  // Bank payment specific fields
  recipientName?: string
  amountNaira?: string
}

interface PaymentSummaryProps {
  paymentData: PaymentData
  onPaymentSuccess?: (txHash: string) => void
  onPaymentError?: (error: string) => void
}

type PaymentTab = 'crypto' | 'bank'

export default function PaymentSummary({ 
  paymentData, 
  onPaymentSuccess, 
  onPaymentError 
}: PaymentSummaryProps) {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: contractHash, error: contractError, isPending: isContractPending } = useWriteContract()
  const { sendTransaction, data: ethHash, error: ethError, isPending: isEthPending } = useSendTransaction()
  const [isProcessing, setIsProcessing] = useState(false)
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [activeTab, setActiveTab] = useState<PaymentTab>('crypto')

  // Use the appropriate hash and error based on transaction type
  const hash = contractHash || ethHash
  const error = contractError || ethError
  const isPending = isContractPending || isEthPending

  // Get balance for the connected wallet
  const { data: balance } = useBalance({
    address: address,
    token: paymentData.token_address as `0x${string}` | undefined,
  })

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  useEffect(() => {
    if (isConfirmed && hash) {
      setTxStatus('success')
      setIsProcessing(false)
      onPaymentSuccess?.(hash)
    }
  }, [isConfirmed, hash, onPaymentSuccess])

  useEffect(() => {
    if (error) {
      setTxStatus('error')
      setIsProcessing(false)
      const errorMsg = error.message || 'Transaction failed'
      setErrorMessage(errorMsg)
      onPaymentError?.(errorMsg)
    }
  }, [error, onPaymentError])

  const handlePayment = async () => {
    if (!isConnected || !address) {
      setErrorMessage('Please connect your wallet')
      return
    }

    // Check if we're on the correct network
    if (chain?.id !== base.id) {
      try {
        await switchChain({ chainId: base.id })
      } catch (err) {
        setErrorMessage('Please switch to Base network')
        return
      }
    }

    setIsProcessing(true)
    setTxStatus('pending')
    setErrorMessage('')

    try {
      if (paymentData.currency === 'ETH') {
        // ETH transfer
        sendTransaction({
          to: paymentData.recipient as `0x${string}`,
          value: parseEther(paymentData.amount),
        })
      } else {
        // ERC-20 token transfer
        if (!paymentData.token_address) {
          throw new Error('Token address is required for ERC-20 transfers')
        }

        const decimals = 6 // USDC has 6 decimals
        const amount = parseUnits(paymentData.amount, decimals)

        writeContract({
          address: paymentData.token_address as `0x${string}`,
          abi: [
            {
              name: 'transfer',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'to', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'bool' }],
            },
          ],
          functionName: 'transfer',
          args: [paymentData.recipient as `0x${string}`, amount],
        })
      }
    } catch (err: any) {
      setTxStatus('error')
      setIsProcessing(false)
      const errorMsg = err.message || 'Payment failed'
      setErrorMessage(errorMsg)
      onPaymentError?.(errorMsg)
    }
  }

  const handleBankPayment = async () => {
    // Placeholder for bank payment logic
    setIsProcessing(true)
    setTxStatus('pending')
    setErrorMessage('')

    try {
      // Simulate bank payment processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      setTxStatus('success')
      setIsProcessing(false)
      onPaymentSuccess?.('bank-payment-success')
    } catch (err: any) {
      setTxStatus('error')
      setIsProcessing(false)
      const errorMsg = err.message || 'Bank payment failed'
      setErrorMessage(errorMsg)
      onPaymentError?.(errorMsg)
    }
  }

  const formatWalletAddress = (addr: string | undefined) => {
    if (!addr || addr.trim() === '') {
      return 'Address not available'
    }
    return formatAddress(addr)
  }

  const getButtonText = () => {
    if (isProcessing || isPending) return 'Processing...'
    if (isConfirming) return 'Confirming...'
    if (txStatus === 'success') return 'Payment Successful!'
    if (activeTab === 'bank') return 'Pay with Bank'
    return 'Pay with Wallet'
  }

  const formatEthBalance = (balance: string) => {
    // Format ETH balance to widely accepted format (max 6 decimal places)
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.000001) return '<0.000001';
    
    // Format with up to 6 decimal places, removing trailing zeros
    return num.toFixed(6).replace(/\.?0+$/, '');
  };

  const formatDisplayAmount = (amount: string, currency: string) => {
    if (currency === 'ETH') {
      return formatEthBalance(amount);
    }
    return amount;
  };

  // Convert crypto amount to Naira equivalent
  const convertToNaira = (amount: string, currency: string): string => {
    // Approximate exchange rates (in a real app, these would come from an API)
    const exchangeRates: Record<string, number> = {
      'ETH': 3800000, // 1 ETH ≈ ₦3,800,000 (approximate)
      'USDC': 1650,   // 1 USDC ≈ ₦1,650 (approximate)
      'BTC': 95000000, // 1 BTC ≈ ₦95,000,000 (approximate)
    };

    const rate = exchangeRates[currency] || 1650; // Default to USDC rate
    const cryptoAmount = parseFloat(amount);
    const nairaAmount = cryptoAmount * rate;
    
    // Format with commas for thousands
    return nairaAmount.toLocaleString('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const renderTabContent = () => {
    if (activeTab === 'crypto') {
      return (
        <>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm font-bold">Sold By</span>
            <span className="text-gray-900 text-sm font-bold">{formatWalletAddress(paymentData.recipient)}</span>
          </div>

          {paymentData.reason && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm font-bold">For</span>
              <span className="text-gray-900 text-sm font-bold">{paymentData.reason}</span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm font-bold">Price</span>
            <span className="text-gray-900 text-sm font-bold">
              {formatDisplayAmount(paymentData.amount, paymentData.currency)} {paymentData.currency}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm font-bold">Network</span>
            <span className="text-gray-900 text-sm font-bold">{paymentData.network}</span>
          </div>
        </>
      )
    }

    return (
      <>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm font-bold">Recipient</span>
          <span className="text-gray-900 text-sm font-bold">{paymentData.recipientName || 'John Doe'}</span>
        </div>

        {paymentData.reason && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm font-bold">For</span>
            <span className="text-gray-900 text-sm font-bold">{paymentData.reason}</span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm font-bold">Price</span>
          <span className="text-gray-900 text-sm font-bold">
            ₦{paymentData.amountNaira || convertToNaira(paymentData.amount, paymentData.currency)}
          </span>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-inter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-lg font-bold text-black">hedwig.</h1>
      </div>

      {/* Payment Summary Card - Positioned at top middle */}
      <div className="flex justify-center">
        <Card className="w-full max-w-md bg-white shadow-sm border border-gray-200">
          <CardHeader className="text-center pb-4 border-b-0">
            <CardTitle className="text-xl font-bold text-gray-900">Payment Summary</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
              <button
                onClick={() => setActiveTab('crypto')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-colors ${
                  activeTab === 'crypto'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pay with Crypto
              </button>
              <button
                onClick={() => setActiveTab('bank')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-colors ${
                  activeTab === 'bank'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pay with Bank
              </button>
            </div>

            {/* Payment Details */}
            <div className="space-y-3">
              {renderTabContent()}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="text-red-600 text-sm text-center font-bold">
                {errorMessage}
              </div>
            )}

            {/* Pay Button */}
            <div className="pt-4">
              {activeTab === 'crypto' ? (
                <ConnectButton.Custom>
                  {({ account, chain, openConnectModal, mounted }) => {
                    const ready = mounted;
                    const connected = ready && account && chain;
                    return (
                      <Button
                        onClick={() => {
                          if (!connected) {
                            openConnectModal();
                            return;
                          }
                          handlePayment();
                        }}
                        disabled={isProcessing || isPending || isConfirming || txStatus === 'success'}
                        className="w-full text-white font-bold py-2.5 rounded-lg transition-colors"
                        style={{ backgroundColor: '#669bbc' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5a8aa8'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#669bbc'}
                        size="lg"
                      >
                        {getButtonText()}
                      </Button>
                    );
                  }}
                </ConnectButton.Custom>
              ) : (
                <Button
                  onClick={handleBankPayment}
                  disabled={isProcessing || txStatus === 'success'}
                  className="w-full text-white font-bold py-2.5 rounded-lg transition-colors"
                  style={{ backgroundColor: '#669bbc' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5a8aa8'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#669bbc'}
                  size="lg"
                >
                  {getButtonText()}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}