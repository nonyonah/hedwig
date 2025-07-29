import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import { Copy, Download, Mail, ExternalLink, CheckCircle } from 'lucide-react';

interface ReceiptData {
  id: string;
  status: 'completed' | 'pending' | 'failed';
  amount: number;
  currency: string;
  transactionHash: string;
  network: string;
  confirmations: number;
  fromWallet: string;
  toWallet: string;
  merchantName: string;
  merchantEmail: string;
  customerName: string;
  customerEmail: string;
  description: string;
  timestamp: string;
  receiptUrl: string;
  fees?: number;
  exchangeRate?: number;
}

const Receipt: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const [copied, setCopied] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchReceiptData = async () => {
      if (!id || !router.isReady) return;
      
      try {
        const { data: paymentLink, error } = await supabase
          .from('payment_links')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error fetching receipt data:', error);
          setLoading(false);
          return;
        }

        if (paymentLink) {
          const transformedData: ReceiptData = {
            id: paymentLink.id,
            status: paymentLink.status || 'completed',
            amount: paymentLink.amount,
            currency: paymentLink.token || 'USDC',
            transactionHash: paymentLink.transaction_hash || '0x1234567890abcdef1234567890abcdef12345678',
            network: paymentLink.network || 'Ethereum',
            confirmations: 12,
            fromWallet: paymentLink.wallet_address || '0x742d35Cc6634C0532925a3b8D',
            toWallet: paymentLink.wallet_address || '0x8ba1f109551bD432803012645Hac136c',
            merchantName: paymentLink.user_name || 'Merchant Name',
            merchantEmail: paymentLink.recipient_email || 'merchant@example.com',
            customerName: 'Customer Name',
            customerEmail: 'customer@example.com',
            description: paymentLink.for || 'Payment description',
            timestamp: paymentLink.created_at || new Date().toISOString(),
            receiptUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/receipt/${paymentLink.id}`,
            fees: 2.50,
            exchangeRate: 1.00
          };
          setReceiptData(transformedData);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReceiptData();
  }, [id, router.isReady]);

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownloadPDF = () => {
    console.log('Downloading PDF...');
  };

  const handleEmailReceipt = () => {
    console.log('Emailing receipt...');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (!receiptData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Receipt Not Found</h1>
          <p className="text-gray-600">The receipt you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Payment Receipt</h1>
                <p className="text-sm text-gray-600 mt-1">Receipt ID: {receiptData.id}</p>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <span className="text-sm font-medium text-green-600 capitalize">
                  {receiptData.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Transaction Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Transaction Summary</h2>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Amount</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {receiptData.amount} {receiptData.currency}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="text-lg font-medium text-gray-900">
                      {new Date(receiptData.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction Details */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Transaction Details</h2>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Amount</p>
                    <p className="text-lg font-medium text-gray-900">
                      {receiptData.amount} {receiptData.currency}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Fees</p>
                    <p className="text-lg font-medium text-gray-900">
                      ${receiptData.fees?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Exchange Rate</p>
                    <p className="text-lg font-medium text-gray-900">
                      1 {receiptData.currency} = ${receiptData.exchangeRate?.toFixed(2) || '1.00'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="text-lg font-bold text-gray-900">
                      ${(receiptData.amount * (receiptData.exchangeRate || 1) + (receiptData.fees || 0)).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Blockchain Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Blockchain Information</h2>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Transaction Hash</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-sm font-mono text-gray-900 break-all">
                      {receiptData.transactionHash}
                    </p>
                    <button
                      onClick={() => copyToClipboard(receiptData.transactionHash, 'hash')}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {copied === 'hash' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Network</p>
                    <p className="text-lg font-medium text-gray-900">{receiptData.network}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Confirmations</p>
                    <p className="text-lg font-medium text-gray-900">{receiptData.confirmations}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">From Wallet</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <p className="text-sm font-mono text-gray-900 break-all">
                        {receiptData.fromWallet}
                      </p>
                      <button
                        onClick={() => copyToClipboard(receiptData.fromWallet, 'from')}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {copied === 'from' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">To Wallet</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <p className="text-sm font-mono text-gray-900 break-all">
                        {receiptData.toWallet}
                      </p>
                      <button
                        onClick={() => copyToClipboard(receiptData.toWallet, 'to')}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {copied === 'to' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Party Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Party Information</h2>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Merchant</h3>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-900">{receiptData.merchantName}</p>
                      <p className="text-sm text-gray-600">{receiptData.merchantEmail}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Customer</h3>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-900">{receiptData.customerName}</p>
                      <p className="text-sm text-gray-600">{receiptData.customerEmail}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Description</h2>
              </div>
              <div className="px-6 py-4">
                <p className="text-gray-700">{receiptData.description}</p>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
              </div>
              <div className="px-6 py-4 space-y-3">
                <button
                  onClick={() => copyToClipboard(receiptData.receiptUrl, 'receipt')}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  {copied === 'receipt' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span>{copied === 'receipt' ? 'Copied!' : 'Copy Receipt Link'}</span>
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={handleEmailReceipt}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  <span>Email Receipt</span>
                </button>
              </div>
            </div>

            {/* Receipt Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Receipt Information</h2>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Receipt ID</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{receiptData.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Generated</p>
                  <p className="text-sm text-gray-900">
                    {new Date(receiptData.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 capitalize">
                    {receiptData.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Receipt;