import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Download, Send, Wallet, CreditCard, Calendar, User, Building, FileText, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createClient } from '@supabase/supabase-js';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issueDate: string;
  dueDate: string;
  fromCompany: {
    name: string;
    address: string;
    email: string;
    phone: string;
  };
  toCompany: {
    name: string;
    address: string;
    email: string;
    phone: string;
  };
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  paymentTerms: string;
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function InvoicePage() {
  const router = useRouter();
  const { id } = router.query;
  const { ready, authenticated, user, login, logout, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Fetch invoice data from API
  useEffect(() => {
    if (id) {
      fetchInvoiceData();
    }
  }, [id]);

  const fetchInvoiceData = async () => {
    try {
      const response = await fetch(`/api/invoices/${id}`);
      if (response.ok) {
        const data = await response.json();
        // Generate AI notes if not present
        if (!data.notes) {
          data.notes = await generateAINotes(data);
        }
        setInvoiceData(data);
      } else {
        console.error('Failed to fetch invoice data');
      }
    } catch (error) {
      console.error('Error fetching invoice:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAINotes = async (invoiceData: any) => {
    try {
      const response = await fetch('/api/ai/generate-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: invoiceData.items,
          total: invoiceData.total,
          clientName: invoiceData.toCompany?.name || invoiceData.client_name
        })
      });
      
      if (response.ok) {
        const { notes } = await response.json();
        return notes;
      }
    } catch (error) {
      console.error('Error generating AI notes:', error);
    }
    
    // Fallback notes
    return 'Thank you for your business! We appreciate the opportunity to work with you.';
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Invoice link copied to clipboard');
  };

  const handleConnectWallet = async () => {
    if (!ready) {
      toast.error('Wallet not ready');
      return;
    }

    try {
      if (!authenticated) {
        await login();
      } else {
        await connectWallet();
      }
      toast.success('Wallet connected successfully!');
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
    }
  };

  const handleCryptoPayment = async () => {
    if (!invoiceData || !wallets.length) {
      toast.error('No wallet connected');
      return;
    }

    const wallet = wallets[0]; // Use the first connected wallet
    console.log('Wallet object:', wallet);
    console.log('Wallet client type:', wallet.walletClientType);
    
    // Check if wallet supports Ethereum (most wallets do)
    if (!wallet.walletClientType || wallet.walletClientType === 'solana') {
      toast.error('Please connect an Ethereum-compatible wallet');
      return;
    }

    // Get the Ethereum provider from the wallet
    const provider = await wallet.getEthereumProvider();

    setProcessingPayment(true);
    try {
      // Calculate total amount with 0.5% transaction fee
      const transactionFee = invoiceData.subtotal * 0.005;
      const totalWithFee = invoiceData.subtotal + transactionFee;
       
      // Convert amount to Wei (assuming USDC has 6 decimals)
      const amountInWei = (totalWithFee * 1000000).toString();
      
      // USDC contract address on Base Sepolia
      const usdcContractAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
      
      // ERC-20 transfer function signature
      const transferFunctionSignature = '0xa9059cbb';
      
      // For demo purposes, we'll use a default recipient address
      // In production, this should come from the invoice data
      const recipientAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';
      
      // Encode recipient address (remove 0x and pad to 32 bytes)
      const recipientAddressEncoded = recipientAddress.slice(2).padStart(64, '0');
      
      // Encode amount (pad to 32 bytes)
      const amountHex = parseInt(amountInWei).toString(16).padStart(64, '0');
      
      // Construct transaction data
      const data = transferFunctionSignature + recipientAddressEncoded + amountHex;

      // Send the transaction using the provider
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet.address,
          to: usdcContractAddress,
          value: '0x0',
          data: data,
        }]
      });
      
      toast.success(`Transaction sent! Hash: ${txHash}`);
      
      // Update invoice status to paid
      const response = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: 'paid',
          transaction_hash: txHash,
          transaction_fee: transactionFee
        })
      });
      
      if (response.ok) {
        setInvoiceData(prev => prev ? { ...prev, status: 'paid' } : null);
        toast.success('Payment completed successfully!');
      } else {
        console.error('Error updating invoice status');
      }
      
    } catch (error) {
      console.error('Error sending transaction:', error);
      toast.error('Failed to send payment transaction');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`/api/invoices/${id}/pdf`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoiceData?.invoiceNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('PDF downloaded successfully');
      }
    } catch (error) {
      toast.error('Failed to download PDF');
    }
  };

  const handleSendInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST'
      });
      if (response.ok) {
        toast.success('Invoice sent successfully');
        fetchInvoiceData();
      }
    } catch (error) {
      toast.error('Failed to send invoice');
    }
  };

  const handleBankPayment = () => {
    window.location.href = `/payment/bank/${id}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!invoiceData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Invoice Not Found</h2>
              <p className="text-gray-600">The invoice you're looking for doesn't exist.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColor = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800'
  };

  const isOverdue = new Date(invoiceData.dueDate) < new Date() && invoiceData.status !== 'paid';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invoice</h1>
            <p className="text-gray-600 mt-1">{invoiceData.invoiceNumber}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={statusColor[isOverdue ? 'overdue' : invoiceData.status]}>
              {isOverdue ? 'Overdue' : invoiceData.status.charAt(0).toUpperCase() + invoiceData.status.slice(1)}
            </Badge>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleSendInvoice}>
                <Send className="h-4 w-4 mr-2" />
                Send Invoice
              </Button>
            </div>
          </div>
        </div>

        {/* Invoice Details */}
        <Card className="mb-6">
          <CardContent className="p-8">
            {/* Header Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* From Company */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Building className="h-5 w-5 mr-2" />
                  From
                </h3>
                <div className="space-y-1">
                  <p className="font-medium">{invoiceData.fromCompany.name}</p>
                  <p className="text-gray-600 whitespace-pre-line">{invoiceData.fromCompany.address}</p>
                  <p className="text-gray-600">{invoiceData.fromCompany.email}</p>
                  <p className="text-gray-600">{invoiceData.fromCompany.phone}</p>
                </div>
              </div>

              {/* To Company */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Bill To
                </h3>
                <div className="space-y-1">
                  <p className="font-medium">{invoiceData.toCompany.name}</p>
                  <p className="text-gray-600 whitespace-pre-line">{invoiceData.toCompany.address}</p>
                  <p className="text-gray-600">{invoiceData.toCompany.email}</p>
                  <p className="text-gray-600">{invoiceData.toCompany.phone}</p>
                </div>
              </div>
            </div>

            {/* Invoice Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Invoice Number</h4>
                <p className="text-lg font-semibold">{invoiceData.invoiceNumber}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Issue Date
                </h4>
                <p className="text-lg font-semibold">{new Date(invoiceData.issueDate).toLocaleDateString()}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Due Date
                </h4>
                <p className="text-lg font-semibold">{new Date(invoiceData.dueDate).toLocaleDateString()}</p>
              </div>
            </div>

            <Separator className="my-8" />

            {/* Items Table */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Items
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-500">Description</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500">Qty</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500">Rate</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceData.items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-4 px-4">
                          <p className="font-medium text-gray-900">{item.description}</p>
                        </td>
                        <td className="py-4 px-4 text-right text-gray-600">{item.quantity}</td>
                        <td className="py-4 px-4 text-right text-gray-600">${item.rate.toFixed(2)}</td>
                        <td className="py-4 px-4 text-right font-medium">${item.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full max-w-sm space-y-2">
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">${invoiceData.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Transaction Fee (0.5%):</span>
                  <span className="font-medium">${(invoiceData.subtotal * 0.005).toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between py-3">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-lg font-bold text-blue-600">${(invoiceData.subtotal + (invoiceData.subtotal * 0.005)).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes and Payment Terms */}
            {(invoiceData.notes || invoiceData.paymentTerms) && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {invoiceData.notes && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Notes</h4>
                      <p className="text-gray-600">{invoiceData.notes}</p>
                    </div>
                  )}
                  {invoiceData.paymentTerms && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Payment Terms</h4>
                      <p className="text-gray-600">{invoiceData.paymentTerms}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Section */}
        {invoiceData.status !== 'paid' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2" />
                Pay Invoice
              </CardTitle>
              <CardDescription>
                Choose your preferred payment method to complete the payment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Payment Methods */}
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center transition-colors hover:bg-gray-50"
                  onClick={authenticated && wallets.length > 0 ? handleCryptoPayment : handleConnectWallet}
                  disabled={!ready || processingPayment}
                >
                  <Wallet className="h-6 w-6 mb-2" />
                  <span>
                    {processingPayment ? 'Processing...' : 
                     authenticated && wallets.length > 0 ? 'Pay with Crypto' : 'Connect Wallet'}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center transition-colors hover:bg-gray-50"
                  onClick={handleBankPayment}
                >
                  <CreditCard className="h-6 w-6 mb-2" />
                  <span>Bank Transfer</span>
                </Button>
              </div>

              <div className="text-center text-sm text-gray-600">
                Amount: ${(invoiceData.subtotal + (invoiceData.subtotal * 0.005)).toFixed(2)} • Transaction fee: 0.5%
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}