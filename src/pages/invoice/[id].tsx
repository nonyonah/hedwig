import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
// Card components removed - using new design without cards
import { Badge } from '@/components/ui/badge';
// Separator component removed - using new design without separators
import { Download, Wallet, CreditCard, Calendar, User, Building, FileText, DollarSign, CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';
import { useHedwigPayment } from '@/hooks/useHedwigPayment';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { getSupportedTokens } from '@/contracts/config';
import { AppKitButton } from '@/components/AppKitButton';

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

function PaymentFlow({ 
  invoiceData, 
  subtotal,
  selectedChain,
  selectedToken
}: { 
  invoiceData: InvoiceData; 
  subtotal: number;
  selectedChain: { id: number; name: string; color: string };
  selectedToken: { address: string; symbol: string; decimals: number };
}) {
  const { isConnected } = useAccount();

  // Use selected chain and token
  const chainId = selectedChain.id;
  const tokenConfig = selectedToken;

  const { 
    processPayment, 
    isConfirming, 
    hash: paymentHash, 
    receipt: paymentReceipt, 
    resetTransaction,
    isProcessing 
  } = useHedwigPayment();

  const handlePay = () => {
    if (!invoiceData.fromCompany.walletAddress) {
      toast.error('Freelancer wallet address is not configured for this invoice.');
      return;
    }
    // Enhanced validation for payment amount
    if (!subtotal || Number.isNaN(subtotal) || subtotal <= 0 || typeof subtotal !== 'number') {
      console.error('Invalid payment amount:', { subtotal, type: typeof subtotal });
      toast.error('Invalid payment amount. Please refresh the page and try again.');
      return;
    }
    if (invoiceData.status === 'paid') {
      toast.error('This invoice has already been paid.');
      return;
    }
    processPayment({
      amount: subtotal,
      freelancerAddress: invoiceData.fromCompany.walletAddress as `0x${string}`,
      invoiceId: invoiceData.id,
      chainId: chainId,
      tokenAddress: tokenConfig.address as `0x${string}`,
      tokenSymbol: tokenConfig.symbol,
    });
  };

  if (!isConnected) {
    return (
      <div className="w-full">
        <AppKitButton className="w-full" size="lg" />
      </div>
    );
  }

  const isAlreadyPaid = invoiceData.status === 'paid';

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button 
        onClick={handlePay} 
        disabled={isAlreadyPaid || !!paymentReceipt || isConfirming || isProcessing} 
        className="flex-1 px-6 py-3 bg-[#8e01bb] hover:bg-[#7a01a5] text-white rounded-lg font-medium transition-all duration-200 hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isAlreadyPaid ? (
          <><CheckCircle className="h-4 w-4 mr-2" /> Invoice Already Paid</>
        ) : isConfirming ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
        ) : paymentReceipt ? (
          <><CheckCircle className="h-4 w-4 mr-2" /> Payment Successful</>
        ) : (
          <><Wallet className="h-4 w-4 mr-2" /> Pay ${subtotal.toLocaleString()} {tokenConfig?.symbol || 'USDC'}</>
        )}
      </Button>
      
      {isConfirming && !paymentReceipt && !isAlreadyPaid && (
        <Button 
          onClick={() => resetTransaction(true)}
          className="flex-1 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          <><RefreshCw className="h-4 w-4 mr-2" /> Reset & Refresh</>
        </Button>
      )}
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

  // Network selection state - will be set from invoice data
  const [selectedChain, setSelectedChain] = useState({ id: 8453, name: 'Base', color: 'bg-blue-500' });

  // Get USDC token for selected chain
  const getUSDCForChain = (chainId: number) => {
    if (chainId === 8453) { // Base
      return {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6
      };
    } else if (chainId === 42220) { // Celo
      return {
        address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
        symbol: 'USDC',
        decimals: 6
      };
    }
    // Default to Base USDC
    return {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6
    };
  };

  const selectedToken = getUSDCForChain(selectedChain.id);

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
        
        // Set the chain based on invoice data
        if (data.blockchain === 'celo' || data.chain_id === 42220) {
          setSelectedChain({ id: 42220, name: 'Celo', color: 'bg-green-500' });
        } else {
          // Default to Base
          setSelectedChain({ id: 8453, name: 'Base', color: 'bg-blue-500' });
        }
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!invoiceData) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invoice Not Found</h2>
            <p className="text-gray-600">The invoice you're looking for doesn't exist.</p>
          </div>
        </div>
      </div>
    );
  }

  // Filter out any fee-related items from the invoice items
  const filteredItems = invoiceData.items.filter(
    item => !item.description.toLowerCase().includes('fee') && 
            !item.description.toLowerCase().includes('platform') &&
            !item.description.toLowerCase().includes('transaction')
  );
  
  // Calculate subtotal from filtered items with validation
  const subtotal = filteredItems.reduce((sum, item) => {
    // Ensure amount is treated as a string first, then parse
    const amountStr = String(item.amount || '0');
    let amount = parseFloat(amountStr);
    
    // Validate the parsed amount
    if (isNaN(amount) || !isFinite(amount) || amount < 0) {
      console.warn('Invalid amount in invoice item:', item.amount, 'defaulting to 0');
      amount = 0;
    }
    
    // Check if amount is very small (likely in wei format) and convert to USDC
    if (amount > 0 && amount < 0.01) {
      // Assume it's in wei (18 decimals) and convert to USDC (6 decimals)
      amount = amount * Math.pow(10, 12);
      console.log('Converted small amount from wei to USDC:', item.amount, '->', amount);
    }
    
    return sum + amount;
  }, 0);
  // Validate subtotal and ensure it's a valid number
  const validSubtotal = typeof subtotal === 'number' && !isNaN(subtotal) && subtotal > 0 ? subtotal : 0;
  const platformFee = validSubtotal * 0.01; // 1% platform fee deducted from payment
  const total = validSubtotal; // Total amount to be paid
  const freelancerReceives = validSubtotal - platformFee; // Amount freelancer receives after fee deduction

  const statusColor = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800'
  };

  const isOverdue = new Date(invoiceData.dueDate) < new Date() && invoiceData.status !== 'paid';

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 md:p-12">
        {/* Company Details */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-gray-500 text-sm mb-2">Billed By :</h3>
            <div className="space-y-1">
              <h4 className="text-xl font-bold text-gray-900">{invoiceData.fromCompany.name}</h4>
              <p className="text-gray-600">{invoiceData.fromCompany.address}</p>
              <p className="text-gray-600">{invoiceData.fromCompany.email}</p>
              <p className="text-gray-600">{invoiceData.fromCompany.phone}</p>
            </div>
          </div>

          <div>
            <h3 className="text-gray-500 text-sm mb-2">Billed To :</h3>
            <div className="space-y-1">
              <h4 className="text-xl font-bold text-gray-900">{invoiceData.toCompany.name}</h4>
              <p className="text-gray-600">{invoiceData.toCompany.address}</p>
              <p className="text-gray-600">{invoiceData.toCompany.email}</p>
              <p className="text-gray-600">{invoiceData.toCompany.phone}</p>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h3 className="text-gray-500 text-sm mb-2">Date Issued :</h3>
            <p className="text-xl font-bold text-gray-900">{new Date(invoiceData.issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div>
            <h3 className="text-gray-500 text-sm mb-2">Due Date:</h3>
            <p className="text-xl font-bold text-gray-900">{new Date(invoiceData.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Invoice Details */}
        <div className="mb-8">
          <h3 className="text-gray-500 text-lg mb-6">Invoice Details</h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 text-gray-600 font-medium">
                    Items/Service
                  </th>
                  <th className="text-center py-3 text-gray-600 font-medium">
                    Quantity
                  </th>
                  <th className="text-right py-3 text-gray-600 font-medium">
                    Unit Price
                  </th>
                  <th className="text-right py-3 text-gray-600 font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="space-y-4">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-4 text-gray-900">
                      {item.description}
                    </td>
                    <td className="py-4 text-center text-gray-900">{item.quantity}</td>
                    <td className="py-4 text-right text-gray-900">${item.rate.toFixed(2)}</td>
                    <td className="py-4 text-right text-gray-900">${item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-full max-w-sm space-y-3">
            <div className="flex justify-between py-2">
              <span className="text-gray-700 font-medium">Subtotal</span>
              <span className="text-gray-900 font-bold">${validSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-700 font-medium">
                Platform fee (1%)
              </span>
              <span className="text-gray-900 font-bold">-${platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-700 font-medium">Freelancer receives</span>
              <span className="text-gray-900 font-bold">${freelancerReceives.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 pt-3">
              <div className="flex justify-between">
                <span className="text-gray-900 font-bold text-lg">
                  Grand Total
                </span>
                <span className="text-gray-900 font-bold text-lg">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoiceData.notes && (
          <div className="mb-8">
            <h3 className="text-gray-900 font-bold text-lg mb-3">Notes</h3>
            <div className="text-gray-600">
              {invoiceData.notes.split('\n').map((line, index) => (
                <p key={index} className="mb-2">
                  {line.startsWith('•') ? line : `• ${line}`}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end pt-8 border-t border-gray-200 mb-8">
          <div>
            <p className="text-gray-900 font-bold">
              {invoiceData.fromCompany.name}
            </p>
          </div>
          <div>
            <p className="text-gray-600">{invoiceData.fromCompany.phone}</p>
          </div>
        </div>

        {/* Payment Section */}
        {invoiceData.status !== 'paid' ? (
          <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="text-lg font-bold text-gray-900 mb-3">
              Pay with Cryptocurrency
            </h4>
            <p className="text-gray-600 mb-4">
              Secure payment processing via smart contract. Connect your wallet to pay this invoice.
            </p>
            
            {/* Payment Details */}
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Recipient:</span>
                <span className="font-medium">{invoiceData.fromCompany.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Wallet Address:</span>
                <span className="font-mono text-xs bg-white px-2 py-1 rounded">
                  {invoiceData.fromCompany.walletAddress ? 
                    `${invoiceData.fromCompany.walletAddress.slice(0, 6)}...${invoiceData.fromCompany.walletAddress.slice(-4)}` : 
                    '—'
                  }
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total to Pay:</span>
                <div className="flex items-center space-x-2">
                  <span className="font-bold">${total.toLocaleString()} USDC</span>
                  <span className="text-gray-400">on</span>
                  <div className="flex items-center px-3 py-1 bg-white border border-gray-200 rounded-lg">
                    <div className={`w-3 h-3 rounded-full ${selectedChain.color} mr-2`}></div>
                    <span className="text-gray-900 font-medium text-sm">{selectedChain.name}</span>
                  </div>
                </div>
              </div>
            </div>

            <PaymentFlow 
              invoiceData={invoiceData} 
              subtotal={total}
              selectedChain={selectedChain}
              selectedToken={selectedToken}
            />
          </div>
        ) : (
          <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
            <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
              Payment Completed
            </h4>
            <p className="text-gray-600 mb-4">
              This invoice has been successfully paid and processed.
            </p>
            
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Recipient:</span>
                <span className="font-medium">{invoiceData.fromCompany.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount Paid:</span>
                <span className="font-bold">${total.toLocaleString()} {selectedToken?.symbol || 'USDC'}</span>
              </div>
            </div>

            <div className="flex items-center justify-center p-4 bg-green-100 border border-green-200 rounded-lg">
              <CheckCircle className="h-6 w-6 mr-3 text-green-600" />
              <span className="text-green-800 font-medium">Payment Completed</span>
            </div>
          </div>
        )}


      </div>


    </div>
  );
}