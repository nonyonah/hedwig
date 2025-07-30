import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, ExternalLink, Wallet, CreditCard, Clock, Shield, Building, CheckCircle, AlertCircle, Download, Send, ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createClient } from '@supabase/supabase-js';
import { flutterwaveService } from '@/lib/flutterwaveService';

interface PaymentData {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'expired';
  recipient: {
    name: string;
    email: string;
  };
  walletAddress: string;
  expiresAt: string;
  bankDetails: {
    accountName: string;
    bankName: string;
    accountNumber: string;
    routingNumber: string;
  };
  network: string;
  token: string;
  payment_reason: string;
  created_at: string;
  updated_at: string;
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// flutterwaveService is imported from the service file

export default function PaymentLinkPage() {
  const router = useRouter()
  const { id } = router.query
  const { ready, authenticated, user, login, logout, connectWallet } = usePrivy()
  const { wallets } = useWallets()
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'stablecoin' | 'bank' | 'crypto' | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string>('base-sepolia');

  // Supported chains (testnet for now)
  const supportedChains = [
    { id: 'base-sepolia', name: 'Base Sepolia (Testnet)', symbol: 'ETH' }
  ];

  useEffect(() => {
    const fetchPaymentData = async () => {
      if (!id) return
      
      try {
        const { data, error } = await supabase
          .from('payment_links')
          .select('*')
          .eq('id', id)
          .single()

        if (error) {
          console.error('Error fetching payment data:', error)
          toast.error('Failed to load payment data')
          return
        }

        if (data) {
          setPaymentData({
            id: data.id,
            title: data.payment_reason || 'Payment Request',
            description: data.payment_reason || 'Payment for services',
            amount: parseFloat(data.amount),
            currency: data.token,
            status: data.status,
            recipient: {
              name: data.user_name,
              email: data.recipient_email || ''
            },
            walletAddress: data.wallet_address,
            expiresAt: data.expires_at,
            bankDetails: {
              accountName: data.user_name,
              bankName: 'Flutterwave Virtual Account',
              accountNumber: 'Generated on payment',
              routingNumber: 'N/A'
            },
            network: data.network,
            token: data.token,
            payment_reason: data.payment_reason,
            created_at: data.created_at,
            updated_at: data.updated_at
          })
        }
      } catch (error) {
        console.error('Error fetching payment data:', error)
        toast.error('Failed to load payment data')
      } finally {
        setLoading(false)
      }
    }

    fetchPaymentData()
  }, [id])

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Payment link copied to clipboard!')
  }

  const handleConnectWallet = async () => {
    if (!ready) {
      toast.error('Wallet not ready')
      return
    }

    try {
      if (!authenticated) {
        await login()
      } else {
        await connectWallet()
      }
      toast.success('Wallet connected successfully!')
    } catch (error) {
      console.error('Error connecting wallet:', error)
      toast.error('Failed to connect wallet')
    }
  }

  const handleBankPayment = async () => {
    if (!paymentData) return
    
    setProcessingPayment(true)
    try {
      const bankPaymentData = await flutterwaveService.createBankPaymentForCrypto({
        id: id as string,
        amount: paymentData.amount.toString(),
        currency: paymentData.currency,
        recipientName: paymentData.recipient.name,
        reason: paymentData.payment_reason
      }, {
        email: paymentData.recipient.email,
        firstname: paymentData.recipient.name.split(' ')[0] || 'Customer',
        lastname: paymentData.recipient.name.split(' ')[1] || '',
        phonenumber: '+2348000000000' // Default phone number
      })

      if (bankPaymentData.accountNumber) {
        // Update payment data with bank details
        setPaymentData(prev => prev ? {
          ...prev,
          bankDetails: {
            accountName: bankPaymentData.accountName,
            bankName: bankPaymentData.bankName,
            accountNumber: bankPaymentData.accountNumber,
            routingNumber: bankPaymentData.reference
          }
        } : null)
        
        toast.success('Bank payment details generated!')
      } else {
        toast.error('Failed to generate bank payment details')
      }
    } catch (error) {
      console.error('Error creating bank payment:', error)
      toast.error('Failed to process bank payment')
    } finally {
      setProcessingPayment(false)
    }
  }

  const handleCryptoPayment = async () => {
    if (!paymentData || !wallets.length) {
      toast.error('No wallet connected')
      return
    }

    const wallet = wallets[0] // Use the first connected wallet
    console.log('Wallet object:', wallet)
    console.log('Wallet client type:', wallet.walletClientType)
    
    // Check if wallet supports Ethereum (most wallets do)
    if (!wallet.walletClientType || wallet.walletClientType === 'solana') {
      toast.error('Please connect an Ethereum-compatible wallet')
      return
    }

    // Get the Ethereum provider from the wallet
    const provider = await wallet.getEthereumProvider()

    setProcessingPayment(true)
    try {
      // Convert amount to Wei (assuming USDC has 6 decimals)
      const amountInWei = (paymentData.amount * 1000000).toString()
      
      // USDC contract address on Base Sepolia
      const usdcContractAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      
      // ERC-20 transfer function signature
      const transferFunctionSignature = '0xa9059cbb'
      
      // Encode recipient address (remove 0x and pad to 32 bytes)
      const recipientAddress = paymentData.walletAddress.slice(2).padStart(64, '0')
      
      // Encode amount (pad to 32 bytes)
      const amountHex = parseInt(amountInWei).toString(16).padStart(64, '0')
      
      // Construct transaction data
      const data = transferFunctionSignature + recipientAddress + amountHex

      const transactionRequest = {
        to: usdcContractAddress,
        value: '0x0', // No ETH being sent
        data: data,
        chainId: 84532 // Base Sepolia chain ID
      }

      // Send the transaction using the provider
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet.address,
          to: usdcContractAddress,
          value: '0x0',
          data: data,
        }]
      })
      
      toast.success(`Transaction sent! Hash: ${txHash}`)
      
      // Update payment status to paid
      const { error } = await supabase
        .from('payment_links')
        .update({ status: 'paid' })
        .eq('id', id)
      
      if (error) {
        console.error('Error updating payment status:', error)
      } else {
        setPaymentData(prev => prev ? { ...prev, status: 'paid' } : null)
        toast.success('Payment completed successfully!')
      }
      
    } catch (error) {
      console.error('Error sending transaction:', error)
      toast.error('Failed to send payment transaction')
    } finally {
      setProcessingPayment(false)
    }
  }



  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!paymentData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment Link Not Found</h2>
              <p className="text-gray-600">The payment link you're looking for doesn't exist or has expired.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = new Date(paymentData.expiresAt) < new Date();
  const statusColor = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    expired: 'bg-red-100 text-red-800'
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Request</h1>
          <p className="text-gray-600">Complete your payment securely</p>
        </div>

        {/* Payment Details Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">{paymentData.title}</CardTitle>
              <Badge className={statusColor[isExpired ? 'expired' : paymentData.status]}>
                {isExpired ? 'Expired' : paymentData.status.charAt(0).toUpperCase() + paymentData.status.slice(1)}
              </Badge>
            </div>
            <CardDescription>{paymentData.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Amount */}
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-gray-900">
                  ${paymentData.amount.toLocaleString()}
                </div>
                <div className="text-sm text-gray-600 mt-1">{paymentData.currency}</div>
              </div>

              {/* Recipient Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">To:</span>
                  <div className="font-medium">{paymentData.recipient.name}</div>
                  <div className="text-gray-600">{paymentData.recipient.email}</div>
                </div>
                <div>
                  <span className="text-gray-600">Expires:</span>
                  <div className="font-medium flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {new Date(paymentData.expiresAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Selection */}
        {!isExpired && paymentData.status === 'pending' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Choose Payment Method</CardTitle>
              <CardDescription>Select your preferred payment option</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stablecoin Payment */}
              <div className="border rounded-lg p-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-0 h-auto hover:bg-gray-50"
                  onClick={() => setPaymentMethod(paymentMethod === 'stablecoin' ? null : 'stablecoin')}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Wallet className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Stablecoin Payment</div>
                      <div className="text-sm text-gray-600">Pay with USDC, USDT, or other stablecoins</div>
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {paymentMethod === 'stablecoin' ? '−' : '+'}
                  </div>
                </Button>
                
                {paymentMethod === 'stablecoin' && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Recipient:</span>
                        <span className="font-medium">{paymentData.recipient.name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Wallet Address:</span>
                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {paymentData.walletAddress}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Amount:</span>
                        <span className="font-medium">${paymentData.amount.toLocaleString()} USDC</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Description:</span>
                        <span className="text-right max-w-xs">{paymentData.description}</span>
                      </div>
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-gray-600">Chain:</span>
                        <Select value={selectedChain} onValueChange={setSelectedChain}>
                          <SelectTrigger className="w-48 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {supportedChains.map((chain) => (
                              <SelectItem key={chain.id} value={chain.id}>
                                {chain.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button 
                      onClick={authenticated && wallets.length > 0 ? handleCryptoPayment : handleConnectWallet}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={!ready || processingPayment}
                    >
                      <Wallet className="h-4 w-4 mr-2" />
                      {processingPayment ? 'Processing...' : 
                       authenticated && wallets.length > 0 ? `Pay $${paymentData.amount.toLocaleString()} USDC` : 'Connect Wallet'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Bank Transfer */}
              <div className="border rounded-lg p-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-0 h-auto hover:bg-gray-50"
                  onClick={() => setPaymentMethod(paymentMethod === 'bank' ? null : 'bank')}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Building className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Bank Transfer</div>
                      <div className="text-sm text-gray-600">Traditional wire transfer or ACH</div>
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {paymentMethod === 'bank' ? '−' : '+'}
                  </div>
                </Button>
                
                {paymentMethod === 'bank' && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Account Name:</span>
                        <span className="font-medium">{paymentData.bankDetails.accountName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Bank Name:</span>
                        <span className="font-medium">{paymentData.bankDetails.bankName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Account Number:</span>
                        <span className="font-mono">{paymentData.bankDetails.accountNumber}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Routing Number:</span>
                        <span className="font-mono">{paymentData.bankDetails.routingNumber}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Amount:</span>
                        <span className="font-medium">${paymentData.amount.toLocaleString()} {paymentData.currency}</span>
                      </div>
                    </div>
                    <Button 
                      onClick={handleBankPayment} 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={processingPayment}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {processingPayment ? 'Processing...' : 'Proceed with Bank Transfer'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Info */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Payment ID:</span>
                <span className="font-mono">{paymentData.id}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Created:</span>
                <span>{new Date(paymentData.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Expires:</span>
                <span>{new Date(paymentData.expiresAt).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Copy Link Button */}
        <Button
          onClick={handleCopyLink}
          variant="outline"
          className="w-full mb-6"
        >
          <Copy className="h-4 w-4 mr-2" />
          Copy Payment Link
        </Button>

        {/* Security Notice */}
        <div className="text-center text-sm text-gray-600">
          <div className="flex items-center justify-center mb-2">
            <Shield className="h-4 w-4 mr-1" />
            <span>Secure Payment</span>
          </div>
          <p>Your payment is protected by end-to-end encryption</p>
        </div>
      </div>
    </div>
  );
}