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

        if (paymentLink && paymentLink.status === 'paid') {
          // Transform database data to match our interface
          const transformedData: ReceiptData = {
            id: `RCP-${paymentLink.id}`,
            status: 'completed',
            amount: paymentLink.paid_amount || paymentLink.amount,
            currency: paymentLink.token || 'USDC',
            transactionHash: paymentLink.transaction_hash || '0x0000000000000000000000000000000000000000',
            network: paymentLink.network || 'Polygon',
            confirmations: 15, // Default value
            fromWallet: 'N/A', // Not stored in current schema
            toWallet: paymentLink.wallet_address,
            merchantName: paymentLink.user_name || 'Hedwig User',
            merchantEmail: paymentLink.recipient_email || 'user@hedwig.app',
            customerName: 'Customer', // Not stored in current schema
            customerEmail: 'customer@email.com', // Not stored in current schema
            description: paymentLink.payment_reason || 'Payment via Hedwig',
            timestamp: paymentLink.paid_at || paymentLink.created_at,
            receiptUrl: `${window.location.origin}/receipt/${id}`
          };
          
          setReceiptData(transformedData);
        }
      } catch (error) {
        console.error('Error fetching receipt data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReceiptData();
  }, [id, router.isReady, supabase]);

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const downloadPDF = () => {
    // PDF generation functionality disabled for now
    console.log('PDF download functionality is disabled');
    alert('PDF download functionality is currently disabled');
  };

  const emailReceipt = () => {
    // Email functionality disabled for now
    console.log('Email receipt functionality is disabled');
    alert('Email receipt functionality is currently disabled');
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (!receiptData) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Receipt not found or payment not completed.</p>
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-800"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-8 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
            <p className="text-lg text-gray-600 mb-4">Your payment has been processed successfully.</p>
            <div className="flex justify-center items-center space-x-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(receiptData.status)}`}>
                {receiptData.status.charAt(0).toUpperCase() + receiptData.status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Receipt Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Receipt Details</h2>
              <span className="text-sm text-gray-500">Receipt ID: {receiptData.id}</span>
            </div>

            {/* Amount */}
            <div className="text-center mb-8">
              <div className="text-4xl font-bold text-gray-900 mb-2">
                {receiptData.amount.toLocaleString()} {receiptData.currency}
              </div>
              <div className="text-gray-600">
                Paid on {formatDate(receiptData.timestamp)}
              </div>
            </div>

            {/* Transaction Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Transaction Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Transaction Hash:</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-mono text-gray-900">
                        {receiptData.transactionHash.slice(0, 10)}...{receiptData.transactionHash.slice(-8)}
                      </span>
                      <button
                        onClick={() => copyToClipboard(receiptData.transactionHash, 'hash')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Network:</span>
                    <span className="text-sm text-gray-900">{receiptData.network}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Confirmations:</span>
                    <span className="text-sm text-gray-900">{receiptData.confirmations}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Wallet Addresses</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">From:</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-mono text-gray-900">{receiptData.fromWallet}</span>
                      <button
                        onClick={() => copyToClipboard(receiptData.fromWallet, 'from')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">To:</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-mono text-gray-900">{receiptData.toWallet}</span>
                      <button
                        onClick={() => copyToClipboard(receiptData.toWallet, 'to')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Merchant and Customer Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Merchant Information</h3>
                <div className="space-y-2">
                  <div className="text-sm text-gray-900">{receiptData.merchantName}</div>
                  <div className="text-sm text-gray-600">{receiptData.merchantEmail}</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Customer Information</h3>
                <div className="space-y-2">
                  <div className="text-sm text-gray-900">{receiptData.customerName}</div>
                  <div className="text-sm text-gray-600">{receiptData.customerEmail}</div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Description</h3>
              <p className="text-sm text-gray-900">{receiptData.description}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => copyToClipboard(receiptData.receiptUrl, 'receipt')}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Copy className="h-4 w-4 mr-2" />
                {copied === 'receipt' ? 'Copied!' : 'Copy Receipt Link'}
              </button>
              
              <button
                onClick={downloadPDF}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </button>
              
              <button
                onClick={emailReceipt}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email Receipt
              </button>
              
              <a
                href={`https://polygonscan.com/tx/${receiptData.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Explorer
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>This receipt was generated by Hedwig. Keep this for your records.</p>
        </div>
      </div>
    </div>
  );
};

export default Receipt;