import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance, useSwitchChain, useWriteContract, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, parseUnits, formatEther } from 'viem'
import { base } from 'viem/chains'
import { useState, useEffect } from 'react'

interface PaymentData {
  id: string
  recipient: string
  amount: string
  currency: string
  description: string
  network: string
  token_address?: string
}

interface PaymentSummaryProps {
  paymentData: PaymentData
  onPaymentSuccess?: (txHash: string) => void
  onPaymentError?: (error: string) => void
}

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

  const formatAddress = (addr: string | undefined) => {
    if (!addr) return 'Unknown'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet'
    if (isProcessing || isPending) return 'Processing...'
    if (isConfirming) return 'Confirming...'
    if (txStatus === 'success') return 'Payment Successful!'
    return 'Pay with wallet'
  }

  const getButtonVariant = () => {
    if (txStatus === 'success') return 'secondary'
    if (txStatus === 'error') return 'destructive'
    return 'default'
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
                <span className="text-gray-900 text-sm font-medium">
                  {formatAddress(paymentData.recipient)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">For</span>
                <span className="text-gray-900 text-sm font-medium">
                  {paymentData.description}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Price</span>
                <span className="text-gray-900 text-sm font-medium">
                  {paymentData.amount} {paymentData.currency}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Network</span>
                <span className="text-gray-900 text-sm font-medium">
                  {paymentData.network}
                </span>
              </div>

              {/* Balance Display */}
              {isConnected && balance && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Your Balance</span>
                  <span className="text-gray-900 text-sm font-medium">
                    {parseFloat(formatEther(balance.value)).toFixed(4)} {balance.symbol}
                  </span>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{errorMessage}</p>
              </div>
            )}

            {/* Transaction Hash */}
            {hash && txStatus === 'success' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-600 text-sm">
                  Transaction: {formatAddress(hash)}
                </p>
              </div>
            )}

            {/* Pay Button */}
            <div className="pt-4">
              {!isConnected ? (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <Button
                      onClick={openConnectModal}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg"
                      size="lg"
                    >
                      Connect Wallet
                    </Button>
                  )}
                </ConnectButton.Custom>
              ) : (
                <Button
                  onClick={handlePayment}
                  disabled={isProcessing || isPending || isConfirming || txStatus === 'success'}
                  variant={getButtonVariant()}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
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