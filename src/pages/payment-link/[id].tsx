import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Wallet, Building, Clock, DollarSign, User, Calendar } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

interface PaymentLinkData {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: 'active' | 'expired' | 'paid';
  expiresAt: string;
  createdAt: string;
  merchant: {
    name: string;
    email: string;
    logo?: string;
  };
  paymentMethods: string[];
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    routingNumber: string;
    bankName: string;
  };
}

const PaymentLink: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const [paymentData, setPaymentData] = useState<PaymentLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletConnected, setWalletConnected] = useState(false);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchPaymentLinkData = async () => {
      if (!id || !router.isReady) return;
      
      try {
        const { data: paymentLink, error } = await supabase
          .from('payment_links')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error fetching payment link:', error);
          setLoading(false);
          return;
        }

        if (paymentLink) {
          // Transform database data to match our interface
          const transformedData: PaymentLinkData = {
            id: paymentLink.id,
            title: paymentLink.payment_reason || 'Payment Request',
            description: paymentLink.payment_reason || 'Payment request via Hedwig',
            amount: paymentLink.amount,
            currency: 'USD', // Default currency, could be made dynamic
            status: paymentLink.status === 'paid' ? 'paid' : 
                   (paymentLink.expires_at && new Date(paymentLink.expires_at) < new Date()) ? 'expired' : 'active',
            expiresAt: paymentLink.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: paymentLink.created_at,
            merchant: {
              name: paymentLink.user_name || 'Hedwig User',
              email: paymentLink.recipient_email || 'user@hedwig.app'
            },
            paymentMethods: ['crypto', 'bank'],
            bankDetails: {
              accountName: paymentLink.user_name || 'Hedwig User',
              accountNumber: '****1234',
              routingNumber: '021000021',
              bankName: 'Default Bank'
            }
          };
          
          setPaymentData(transformedData);
        }
      } catch (error) {
        console.error('Error fetching payment link:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentLinkData();
  }, [id, router.isReady, supabase]);

  const handleCopyPaymentLink = () => {
    const url = `${window.location.origin}/payment-link/${id}`;
    navigator.clipboard.writeText(url);
    // You could add a toast notification here
  };

  const handleConnectWallet = () => {
    // Implement wallet connection logic
    setWalletConnected(true);
    // You could integrate with WalletConnect or other wallet providers
  };

  const handleCryptoPayment = () => {
    if (!walletConnected) {
      handleConnectWallet();
      return;
    }
    // Redirect to crypto payment flow
    router.push(`/payment?link=${id}&method=crypto`);
  };

  const handleBankPayment = () => {
    // Redirect to bank payment flow
    router.push(`/payment?link=${id}&method=bank`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'expired': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isExpired = () => {
    if (!paymentData) return false;
    return new Date(paymentData.expiresAt) < new Date();
  };

  const getTimeRemaining = () => {
    if (!paymentData) return '';
    const now = new Date();
    const expiry = new Date(paymentData.expiresAt);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
    return 'Less than 1 hour remaining';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading payment link...</p>
        </div>
      </div>
    );
  }

  if (!paymentData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Payment Link Not Found</h1>
          <p className="text-muted-foreground">The payment link you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Payment Request</h1>
          <p className="text-muted-foreground">Complete your payment securely</p>
        </div>

        <Card className="border border-border shadow-sm">
          <CardContent className="p-8">
            {/* Status and Amount */}
            <div className="text-center mb-8">
              <div className="flex justify-center items-center gap-2 mb-4">
                <Badge className={getStatusColor(paymentData.status)}>
                  {paymentData.status.charAt(0).toUpperCase() + paymentData.status.slice(1)}
                </Badge>
                {!isExpired() && paymentData.status === 'active' && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{getTimeRemaining()}</span>
                  </div>
                )}
              </div>
              
              <div className="mb-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <DollarSign className="w-8 h-8 text-primary" />
                  <span className="text-4xl font-bold text-foreground">
                    {paymentData.amount.toLocaleString()}
                  </span>
                  <span className="text-2xl text-muted-foreground">{paymentData.currency}</span>
                </div>
                <p className="text-lg font-medium text-foreground">{paymentData.title}</p>
                <p className="text-muted-foreground mt-2">{paymentData.description}</p>
              </div>
            </div>

            {/* Merchant Info */}
            <div className="bg-muted/30 rounded-lg p-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{paymentData.merchant.name}</p>
                  <p className="text-sm text-muted-foreground">{paymentData.merchant.email}</p>
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            {paymentData.status === 'active' && !isExpired() && (
              <div className="space-y-4 mb-8">
                <h3 className="font-semibold text-foreground mb-4">Choose Payment Method</h3>
                
                <div className="grid gap-4">
                  {paymentData.paymentMethods.includes('crypto') && (
                    <Button
                      variant="outline"
                      className="h-auto p-6 flex items-center justify-between"
                      onClick={handleCryptoPayment}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Wallet className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-foreground">Pay with Crypto</p>
                          <p className="text-sm text-muted-foreground">
                            {walletConnected ? 'Wallet connected' : 'Connect your wallet'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Instant</p>
                      </div>
                    </Button>
                  )}

                  {paymentData.paymentMethods.includes('bank') && (
                    <Button
                      variant="outline"
                      className="h-auto p-6 flex items-center justify-between"
                      onClick={handleBankPayment}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Building className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-foreground">Bank Transfer</p>
                          <p className="text-sm text-muted-foreground">Wire transfer or ACH</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">1-3 days</p>
                      </div>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Bank Transfer Details */}
            {paymentData.bankDetails && (
              <div className="bg-muted/30 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-foreground mb-4">Bank Transfer Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Account Name</p>
                    <p className="font-medium text-foreground">{paymentData.bankDetails.accountName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Account Number</p>
                    <p className="font-medium text-foreground">{paymentData.bankDetails.accountNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Routing Number</p>
                    <p className="font-medium text-foreground">{paymentData.bankDetails.routingNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bank Name</p>
                    <p className="font-medium text-foreground">{paymentData.bankDetails.bankName}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Info */}
            <div className="border-t border-border pt-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment ID</span>
                <span className="font-medium text-foreground">{paymentData.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium text-foreground">
                  {new Date(paymentData.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium text-foreground">
                  {new Date(paymentData.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Copy Link Button */}
            <div className="mt-6">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCopyPaymentLink}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Payment Link
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking'
  };
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 1
  };
}

export default PaymentLink;