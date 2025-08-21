import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Download, Send, Wallet, CreditCard, Calendar, User, Building, FileText, DollarSign, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';
import { useHedwigPayment } from '@/hooks/useHedwigPayment';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

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
    walletAddress?: string;
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

// Initialize Supabase client with environment variable checks
const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not found');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
};

function PaymentFlow({ invoiceData, total }: { invoiceData: InvoiceData; total: number }) {
  const { isConnected } = useAccount();
  const { processPayment, isConfirming, hash: paymentHash, receipt: paymentReceipt } = useHedwigPayment();

  const handlePay = () => {
    if (!invoiceData.fromCompany.walletAddress) {
      toast.error('Freelancer wallet address is not configured for this invoice.');
      return;
    }
    if (!total || Number.isNaN(total) || total <= 0) {
      toast.error('Invalid payment amount.');
      return;
    }
    processPayment({
      amount: total,
      freelancerAddress: invoiceData.fromCompany.walletAddress as `0x${string}`,
      invoiceId: invoiceData.id,
    });
  };

  const ConnectWallet = dynamic(() => import('@coinbase/onchainkit/wallet').then(m => m.ConnectWallet), { ssr: false });

  if (!isConnected) {
    return <ConnectWallet className="w-full" />;
  }

  return (
    <div className="space-y-4">
      <Button onClick={handlePay} disabled={isConfirming} className="w-full">
        {isConfirming ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
        ) : paymentReceipt ? (
          <><CheckCircle className="h-4 w-4 mr-2" /> Payment Successful</>
        ) : (
          <><Wallet className="h-4 w-4 mr-2" /> Pay ${total.toLocaleString()} USDC</>
        )}
      </Button>
    </div>
  );
}

export default function InvoicePage() {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const { id } = router.query;
  const { receipt: paymentReceipt } = useHedwigPayment();
  const { address: accountAddress } = useAccount();

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Set up real-time subscription for invoice status updates
  useRealtimeSubscription({
    table: 'invoices',
    id: Array.isArray(id) ? id[0] : id,
    onUpdate: (payload) => {
      if (payload.new && payload.new.id === (Array.isArray(id) ? id[0] : id)) {
        const updatedData = payload.new;
        const normalizedStatus = updatedData.status === 'completed' ? 'paid' : updatedData.status;
        setInvoiceData(prev => prev ? {
          ...prev,
          status: normalizedStatus,
          updated_at: updatedData.updated_at
        } : null);
        
        if (normalizedStatus === 'paid') {
          toast.success('Payment received! Invoice status updated automatically.');
        }
      }
    }
  });

  useEffect(() => {
    if (id) {
      fetchInvoiceData();
    }
  }, [id]);



  // Keep minimal manual update for immediate UI feedback, but rely on realtime for persistence
  useEffect(() => {
    if (paymentReceipt && invoiceData?.status !== 'paid') {
      // Optimistically update local UI for immediate feedback
      setInvoiceData(prev => (prev ? { ...prev, status: 'paid' } : prev));
      toast.info('Payment confirmed! Updating status...');
      
      // The backend event listener will handle the database update
      // and the realtime subscription will sync the UI automatically
    }
  }, [paymentReceipt, invoiceData?.status]);

  const fetchInvoiceData = async () => {
    try {
      const response = await fetch(`/api/invoices/${id}`);
      if (response.ok) {
        const data = await response.json();
        // Generate AI notes if not present
        if (!data.notes) {
          data.notes = await generateAINotes(data);
        }
        // Fallback: if wallet address is missing on the invoice, try resolving via user-wallet API
        try {
          const currentWallet = data?.fromCompany?.walletAddress;
          const invoiceId = Array.isArray(id) ? id[0] : id;
          if ((!currentWallet || currentWallet === '') && invoiceId) {
            const walletRes = await fetch(`/api/user-wallet?invoiceId=${invoiceId}&chain=base`);
            if (walletRes.ok) {
              const { address } = await walletRes.json();
              if (address) {
                data.fromCompany = { ...(data.fromCompany || {}), walletAddress: address };
                // Persist wallet to invoice on the server (service role)
                try {
                  await fetch(`/api/invoices/${invoiceId}/wallet`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress: address }),
                  });
                } catch (persistErr) {
                  console.warn('Failed to persist wallet on invoice:', persistErr);
                }
              }
            }
          }
        } catch (e) {
          console.warn('Wallet fallback lookup failed:', e);
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


  const handleDeleteInvoice = async () => {
    if (!window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/invoices/${id}/delete`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Invoice deleted successfully');
        setTimeout(() => {
          window.location.href = '/invoices';
        }, 1200);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete invoice');
      }
    } catch (error) {
      toast.error('Failed to delete invoice');
    } finally {
      setDeleting(false);
    }
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

  // Filter out any fee-related items from the invoice items
  const filteredItems = invoiceData.items.filter(
    item => !item.description.toLowerCase().includes('fee') && 
            !item.description.toLowerCase().includes('platform') &&
            !item.description.toLowerCase().includes('transaction')
  );
  
  // Calculate subtotal from filtered items
  const subtotal = filteredItems.reduce((sum, item) => sum + item.amount, 0);
  const platformFee = subtotal * 0.005; // 0.5%
  const total = subtotal + platformFee;

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
                    {filteredItems.map((item) => (
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
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Platform Fee (0.5%):</span>
                  <span className="font-medium">${platformFee.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between py-3">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-lg font-bold text-blue-600">${total.toFixed(2)}</span>
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
        {invoiceData.status !== 'paid' ? (
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
              {/* Recipient and wallet info (mirrors payment link UI) */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Recipient:</span>
                  <span className="font-medium">{invoiceData.fromCompany.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Wallet Address:</span>
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                    {invoiceData.fromCompany.walletAddress || '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium">${total.toLocaleString()} USDC</span>
                </div>
              </div>

              <PaymentFlow invoiceData={invoiceData} total={total} />

              <div className="text-center text-sm text-gray-600">
                Secure payment processing via smart contract
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                Payment Completed
              </CardTitle>
              <CardDescription>
                This invoice has been marked as paid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Recipient:</span>
                  <span className="font-medium">{invoiceData.fromCompany.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium">${total.toLocaleString()} USDC</span>
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
      </div>
    </div>
  );
}