import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, ExternalLink, Wallet, CreditCard, Clock, Shield, Building } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentData {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'expired';
  expiresAt: string;
  recipientName: string;
  recipientEmail: string;
  createdAt: string;
  walletAddress: string;
  bankDetails: {
    accountName: string;
    bankName: string;
    accountNumber: string;
    routingNumber: string;
  };
}

export default function PaymentLinkPage() {
  const router = useRouter();
  const { id } = router.query;
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'crypto' | 'bank' | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);

  // Sample data - replace with actual API call
  useEffect(() => {
    if (id) {
      // Simulate API call
      setTimeout(() => {
        setPaymentData({
          id: id as string,
          title: 'Website Development Services',
          description: 'Full-stack web development for e-commerce platform including frontend, backend, and database setup.',
          amount: 2500.00,
          currency: 'USD',
          status: 'pending',
          expiresAt: '2025-07-30T23:59:59Z',
          recipientName: 'John Doe',
          recipientEmail: 'john@example.com',
          createdAt: '2024-01-15T10:30:00Z',
          walletAddress: '0x742d35Cc6634C0532925a3b8D4C9db96DfB3f681',
          bankDetails: {
            accountName: 'John Doe',
            bankName: 'Chase Bank',
            accountNumber: '****1234',
            routingNumber: '021000021'
          }
        });
        setLoading(false);
      }, 1000);
    }
  }, [id]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Payment link copied to clipboard');
  };

  const handleConnectWallet = () => {
    // Implement wallet connection logic
    setWalletConnected(true);
    toast.success('Wallet connected successfully');
  };

  const handleBankPayment = () => {
    // Implement bank payment logic
    toast.info('Redirecting to bank payment...');
  };

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
                  <div className="font-medium">{paymentData.recipientName}</div>
                  <div className="text-gray-600">{paymentData.recipientEmail}</div>
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
                  className="w-full justify-between p-0 h-auto"
                  onClick={() => setPaymentMethod(paymentMethod === 'crypto' ? null : 'crypto')}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Wallet className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Stablecoin Payment</div>
                      <div className="text-sm text-gray-600">Pay with USDC, USDT, or other stablecoins</div>
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {paymentMethod === 'crypto' ? '−' : '+'}
                  </div>
                </Button>
                
                {paymentMethod === 'crypto' && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Recipient:</span>
                        <span className="font-medium">{paymentData.recipientName}</span>
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
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Chain:</span>
                        <span className="font-medium">Ethereum (ERC-20)</span>
                      </div>
                    </div>
                    <Button 
                      onClick={handleConnectWallet} 
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <Wallet className="h-4 w-4 mr-2" />
                      Connect Wallet
                    </Button>
                  </div>
                )}
              </div>

              {/* Bank Transfer */}
              <div className="border rounded-lg p-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-0 h-auto"
                  onClick={() => setPaymentMethod(paymentMethod === 'bank' ? null : 'bank')}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Building className="h-5 w-5 text-green-600" />
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
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Proceed with Bank Transfer
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
                <span>{new Date(paymentData.createdAt).toLocaleDateString()}</span>
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