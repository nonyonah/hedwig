import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, ExternalLink, Wallet, Clock, Shield, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import dynamic from 'next/dynamic';
import { useHedwigPayment } from '@/hooks/useHedwigPayment';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

// ERC20_ABI is now shared from '@/lib/abi/erc20'

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

// Fetch via server-side API to avoid RLS issues and ensure service role usage

// flutterwaveService is imported from the service file

function PaymentFlow({ paymentData, total }: { paymentData: PaymentData, total: number }) {
  const { isConnected } = useAccount();

  const { 
    processPayment, 
    isConfirming, 
    hash: paymentHash, 
    receipt: paymentReceipt, 
    approvalCompleted, 
    continuePendingPayment 
  } = useHedwigPayment();

  const handlePay = () => {
    processPayment({
      amount: paymentData.amount, // send subtotal only; contract will deduct fee
      freelancerAddress: paymentData.walletAddress as `0x${string}`,
      invoiceId: paymentData.id,
    });
  };

  const ConnectWallet = dynamic(() => import('@coinbase/onchainkit/wallet').then(m => m.ConnectWallet), { ssr: false });

  if (!isConnected) {
    return <ConnectWallet className="w-full" />;
  }

  return (
    <div className="space-y-4">
      <Button 
        onClick={approvalCompleted ? continuePendingPayment : handlePay} 
        disabled={isConfirming || !!paymentReceipt} 
        className="w-full"
      >
          {isConfirming ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
          ) : paymentReceipt ? (
            <><CheckCircle className="h-4 w-4 mr-2" /> Payment Successful</>
          ) : approvalCompleted ? (
            <><Wallet className="h-4 w-4 mr-2" /> Continue Payment</>
          ) : (
            <><Wallet className="h-4 w-4 mr-2" /> Pay {paymentData.amount.toLocaleString()} USDC</>
          )}
      </Button>

      {/* Transaction receipt display removed as requested */}
    </div>
  );
}

export default function PaymentLinkPage() {
  const router = useRouter();
  const { id } = router.query;
  const { receipt: paymentReceipt } = useHedwigPayment();
  
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'stablecoin' | null>(null);

  const subtotal = paymentData?.amount || 0;
  const platformFee = subtotal * 0.01;
  const total = subtotal + platformFee;
  // Note: Only Base Sepolia USDC is supported for now

  // Set up real-time subscription for payment status updates
  useRealtimeSubscription({
    table: 'payment_links',
    id: Array.isArray(id) ? id[0] : id,
    onUpdate: (payload) => {
      if (payload.new && payload.new.id === (Array.isArray(id) ? id[0] : id)) {
        const updatedData = payload.new;
        const normalizedStatus = updatedData.status === 'completed' ? 'paid' : updatedData.status;
        setPaymentData(prev => prev ? {
          ...prev,
          status: normalizedStatus,
          updated_at: updatedData.updated_at
        } : null);
        
        if (normalizedStatus === 'paid') {
          toast.success('Payment received! Status updated automatically.');
        }
      }
    }
  });

  useEffect(() => {
    const fetchPaymentData = async () => {
      if (!id) return;
      try {
        const paymentId = Array.isArray(id) ? id[0] : id;
        const res = await fetch(`/api/payment-links/${paymentId}`);
        if (!res.ok) throw new Error('Failed to fetch payment link');
        const data = await res.json();
        const normalizedStatus = data.status === 'completed' ? 'paid' : data.status;
        setPaymentData({
          id: data.id,
          title: data.payment_reason || 'Payment Request',
          description: data.payment_reason || 'Payment for services',
          amount: parseFloat(data.amount),
          currency: data.token,
          status: normalizedStatus,
          recipient: { name: data.user_name, email: data.recipient_email || '' },
          walletAddress: data.wallet_address,
          expiresAt: data.expires_at,
          bankDetails: { accountName: data.user_name, bankName: 'Flutterwave Virtual Account', accountNumber: 'Generated on payment', routingNumber: 'N/A' },
          network: data.network,
          token: data.token,
          payment_reason: data.payment_reason,
          created_at: data.created_at,
          updated_at: data.updated_at
        });
      } catch (error) {
        console.error('Error fetching payment data:', error);
        toast.error('Failed to load payment data');
      } finally {
        setLoading(false);
      }
    };
    fetchPaymentData();
  }, [id]);



  // Keep minimal manual update for immediate UI feedback, but rely on realtime for persistence
  useEffect(() => {
    if (paymentReceipt && paymentData?.status !== 'paid') {
      // Optimistically update local UI for immediate feedback
      setPaymentData(prev => (prev ? { ...prev, status: 'paid' } : prev));
      toast.info('Payment confirmed! Updating status...');
      
      // The backend event listener will handle the database update
      // and the realtime subscription will sync the UI automatically
    }
  }, [paymentReceipt, paymentData?.status]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Payment link copied to clipboard!')
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">USDC Payment Request</h1>
          <p className="text-gray-600">
            Complete your USDC stablecoin payment securely
            <span
              className="ml-2 text-xs text-gray-500 underline decoration-dotted"
              title="This payment runs on Base Sepolia (testnet)"
            >
              Base Sepolia (testnet)
            </span>
          </p>
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
              <CardTitle>Pay with USDC</CardTitle>
              <CardDescription>
                Complete this payment using USDC on Base network
                <span
                  className="ml-2 text-xs text-gray-500 underline decoration-dotted"
                  title="This payment runs on Base Sepolia (testnet)"
                >
                  Base Sepolia (testnet)
                </span>
              </CardDescription>
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
                      <div className="font-medium">USDC Stablecoin Payment</div>
                      <div className="text-sm text-gray-600">Pay with USDC stablecoin only</div>
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
                        <span className="text-gray-600">Amount Due:</span>
                        <span className="font-medium">${subtotal.toLocaleString()} USDC</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Platform Fee (1%) — deducted:</span>
                        <span className="font-medium">${platformFee.toLocaleString()} USDC</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Freelancer Receives:</span>
                        <span className="font-medium">${(subtotal - platformFee).toLocaleString()} USDC</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold">
                        <span className="text-gray-800">Total to Pay:</span>
                        <span className="text-gray-800">${subtotal.toLocaleString()} USDC</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                        <div className="font-medium mb-1 text-blue-800">💰 USDC Stablecoin Only:</div>
                        <div className="text-blue-700">• This payment link only accepts USDC stablecoin on the Base network.</div>
                        <div className="text-blue-700">• Payment processed through a secure smart contract.</div>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Description:</span>
                        <span className="text-right max-w-xs">{paymentData.description}</span>
                      </div>
                    </div>
                    <PaymentFlow paymentData={paymentData} total={total} />
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        )}

        {/* Payment Completed Section */}
        {paymentData.status === 'paid' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                Payment Completed
              </CardTitle>
              <CardDescription>
                This payment link has been marked as paid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Recipient:</span>
                  <span className="font-medium">{paymentData.recipient.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium">${paymentData.amount.toLocaleString()} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Description:</span>
                  <span className="text-right max-w-xs">{paymentData.description}</span>
                </div>
              </div>

              <div className="flex items-center justify-center p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-6 w-6 mr-3 text-green-600" />
                <span className="text-green-800 font-medium">Marked as Paid</span>
              </div>

              <div className="text-center text-sm text-gray-600">
                Payment has been processed and confirmed
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