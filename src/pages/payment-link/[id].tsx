import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, ExternalLink, Wallet, Clock, Shield, CheckCircle, AlertTriangle, Loader2, RefreshCw, ChevronDown, Check, Building, Lock } from 'lucide-react';
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
  dueDate?: string; // ISO date string for payment due date
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
  const freelancerReceives = total * 0.99; // Amount after 1% platform fee
  const { isConnected } = useAccount();

  const { 
    processPayment, 
    isConfirming, 
    hash: paymentHash, 
    receipt: paymentReceipt, 
    resetTransaction,
    isProcessing 
  } = useHedwigPayment();

  const handlePay = () => {
    if (!total || Number.isNaN(total) || total <= 0) {
      console.error('Invalid payment amount:', total);
      toast.error('Invalid payment amount.');
      return;
    }
    if (paymentData.status === 'paid') {
      toast.error('This payment link has already been paid.');
      return;
    }
    processPayment({
      amount: total, // send total amount including platform fee
      freelancerAddress: paymentData.walletAddress as `0x${string}`,
      invoiceId: paymentData.id,
    });
  };

  const ConnectWallet = dynamic(() => import('@coinbase/onchainkit/wallet').then(m => m.ConnectWallet), { ssr: false });

  if (!isConnected) {
    return <ConnectWallet className="w-full" />;
  }

  const isAlreadyPaid = paymentData.status === 'paid';

  return (
    <div className="space-y-4">
      <Button 
        onClick={handlePay} 
        disabled={isAlreadyPaid || !!paymentReceipt || isConfirming || isProcessing} 
        className="w-full bg-[#8e01bb] hover:bg-[#7a01a5] text-white font-semibold text-lg py-4 rounded-2xl transition-colors"
        style={{ backgroundColor: isAlreadyPaid || !!paymentReceipt || isConfirming || isProcessing ? undefined : '#8e01bb' }}
      >
          {isAlreadyPaid ? (
            <><CheckCircle className="h-4 w-4 mr-2" /> Payment Already Completed</>
          ) : isConfirming ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
          ) : paymentReceipt ? (
            <><CheckCircle className="h-4 w-4 mr-2" /> Payment Successful</>
          ) : (
            <>Pay • ${freelancerReceives.toFixed(2)}</>
          )}
      </Button>
      
      {isConfirming && !paymentReceipt && !isAlreadyPaid && (
        <Button 
          onClick={() => resetTransaction(true)}
          variant="outline"
          className="w-full"
        >
          <><RefreshCw className="h-4 w-4 mr-2" /> Reset & Refresh</>
        </Button>
      )}

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
  const [selectedCurrency, setSelectedCurrency] = useState("USDC");
  const [selectedNetwork, setSelectedNetwork] = useState("Base");
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);

  // Validate and calculate amounts with proper fallbacks
  const rawAmount = paymentData?.amount || 0;
  const validAmount = (typeof rawAmount === 'number' && !Number.isNaN(rawAmount) && rawAmount > 0) ? rawAmount : 0;
  
  const subtotal = validAmount;
  const platformFee = subtotal * 0.01; // 1% platform fee deducted from payment
  const total = subtotal; // Total amount to be paid
  const freelancerReceives = subtotal - platformFee; // Amount freelancer receives after fee deduction
  // Note: Only Base Mainnet USDC is supported for now

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
        // Parse amount with proper validation and conversion
        let parsedAmount = 0;
        if (data.amount) {
          const rawAmount = parseFloat(data.amount);
          // If amount is very small (likely in wei), convert from wei to USDC
          if (rawAmount > 0 && rawAmount < 0.01) {
            // Assume it's in wei format (18 decimals) and convert to USDC (6 decimals)
            parsedAmount = rawAmount * Math.pow(10, 12); // Convert from wei to USDC
          } else if (rawAmount >= 0.01) {
            // Amount is already in proper USDC format
            parsedAmount = rawAmount;
          }
        }
        
        setPaymentData({
          id: data.id,
          title: data.payment_reason || 'Payment Request',
          description: data.payment_reason || 'Payment for services',
          amount: parsedAmount,
          currency: data.token,
          status: normalizedStatus,
          recipient: { name: data.user_name, email: data.recipient_email || '' },
          walletAddress: data.wallet_address,
          expiresAt: data.expires_at,
          dueDate: data.due_date,
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

  // Currency options
  const currencies = [
    { label: "USDC", value: "USDC" },
    { label: "USD Coin", value: "USD_COIN" },
  ];

  // Network options
  const networks = [
    { label: "Base", value: "Base" },
    { label: "Ethereum", value: "Ethereum" },
    { label: "Polygon", value: "Polygon" },
  ];

  // Payment options (disabled)
  const paymentOptions = [
    {
      id: 0,
      type: "Pay with crypto",
      description: "Connect your wallet to pay with cryptocurrency",
      icon: Wallet,
    },
    {
      id: 1,
      type: "Pay with bank",
      description: "Pay directly from your bank account",
      icon: Building,
    },
  ];

  const DropdownModal = ({
    visible,
    onClose,
    options,
    selectedValue,
    onSelect,
    title,
  }: {
    visible: boolean;
    onClose: () => void;
    options: { label: string; value: string }[];
    selectedValue: string;
    onSelect: (value: string) => void;
    title: string;
  }) => {
    if (!visible) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
          <h3 className="text-lg font-semibold text-slate-900 text-center mb-4">
            {title}
          </h3>
          <div className="space-y-2">
            {options.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  onSelect(item.value);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-slate-900 font-medium">{item.label}</span>
                {selectedValue === item.value && (
                  <Check className="w-5 h-5 text-blue-500" />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-full mt-4 py-2 text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
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
    paid: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    expired: 'bg-red-100 text-red-800'
  };

  return (
    <div className="min-h-screen bg-white">


      {/* Main Content */}
      <div className="px-4 py-12">
        <div className="max-w-md mx-auto space-y-4">



          {/* Payment Details Section */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-900">
                Payment Details
              </h2>
              <Badge className={statusColor[isExpired ? 'expired' : paymentData.status]}>
                {isExpired ? 'Expired' : paymentData.status.charAt(0).toUpperCase() + paymentData.status.slice(1)}
              </Badge>
            </div>

            {/* Amount */}
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-600 text-sm">Amount</span>
              <span className="text-base font-bold text-slate-900">${validAmount.toLocaleString()}</span>
            </div>

            {/* Recipient Name */}
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-600 text-sm">Recipient</span>
              <span className="text-sm font-medium text-slate-900">{paymentData.recipient.name}</span>
            </div>

            {/* Wallet Address */}
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-600 text-sm">
                Recipient Address
              </span>
              <span className="text-xs font-medium text-slate-900 flex-1 text-right ml-3">
                {paymentData.walletAddress.slice(0, 6)}...{paymentData.walletAddress.slice(-4)}
              </span>
            </div>

            {/* Due Date */}
            {paymentData.dueDate && (
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-600 text-sm">Due Date</span>
                <span className="text-sm font-medium text-slate-900">
                  {new Date(paymentData.dueDate).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* One-time payment */}
            <div className="text-center mt-3">
              <span className="text-xs text-gray-400">One-time payment</span>
            </div>
          </div>

          {/* Price Section */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-600 text-sm">Price</span>
              <span className="text-sm font-semibold text-slate-900">
                {validAmount} {selectedCurrency}
              </span>
            </div>

            {/* Network */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Network</span>
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                <span className="text-sm font-semibold text-slate-900">
                  {selectedNetwork}
                </span>
              </div>
            </div>
          </div>

          {/* Select Payment Method Section - Commented Out */}
          {/* 
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              Select Payment Method
            </h2>

            {paymentOptions.map((option) => (
              <div
                key={option.id}
                className="flex items-center p-3 rounded-xl border-2 border-gray-200 bg-gray-50 mb-2 opacity-60 cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center mr-3">
                  <option.icon className="w-4 h-4 text-gray-500" />
                </div>

                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">
                    {option.type}
                  </h3>
                  <p className="text-xs text-gray-600">{option.description}</p>
                </div>
              </div>
            ))}
          </div>
          */}



          {/* Payment Flow - Only show if pending and not expired */}
          {!isExpired && paymentData.status === 'pending' && (
            <PaymentFlow paymentData={paymentData} total={total} />
          )}

          {/* Payment Completed Section */}
          {paymentData.status === 'paid' && (
            <div className="flex items-center justify-center p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-6 w-6 mr-3 text-green-600" />
              <span className="text-green-800 font-medium">Payment Completed</span>
            </div>
          )}

          {/* Secured by Hedwig */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Lock className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Secure and Encrypted Payment</span>
            </div>
          </div>
        </div>
      </div>

      {/* Currency Dropdown Modal */}
      <DropdownModal
        visible={showCurrencyModal}
        onClose={() => setShowCurrencyModal(false)}
        options={currencies}
        selectedValue={selectedCurrency}
        onSelect={setSelectedCurrency}
        title="Select Currency"
      />

      {/* Network Dropdown Modal */}
      <DropdownModal
        visible={showNetworkModal}
        onClose={() => setShowNetworkModal(false)}
        options={networks}
        selectedValue={selectedNetwork}
        onSelect={setSelectedNetwork}
        title="Select Network"
      />
    </div>
  );
}