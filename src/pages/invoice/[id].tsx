import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Share2, Wallet, Building, CheckCircle, Calendar, DollarSign } from 'lucide-react';
import { generateInvoicePDF } from '@/modules/pdf-generator';
import { createClient } from '@supabase/supabase-js';

interface InvoiceItem {
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
  merchant: {
    name: string;
    email: string;
    address: string;
    logo?: string;
  };
  client: {
    name: string;
    email: string;
    address: string;
  };
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  paymentMethods: string[];
}

const Invoice: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchInvoiceData = async () => {
      if (!id || !router.isReady) return;
      
      try {
        const { data: invoice, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error fetching invoice:', error);
          setLoading(false);
          return;
        }

        if (invoice) {
          // Transform database data to match our interface
          const transformedData: InvoiceData = {
            id: invoice.id,
            invoiceNumber: invoice.invoice_number || `INV-${invoice.id.slice(0, 8)}`,
            status: invoice.status || 'draft',
            issueDate: new Date(invoice.date_created).toISOString().split('T')[0],
            dueDate: invoice.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            merchant: {
              name: invoice.freelancer_name,
              email: invoice.freelancer_email,
              address: 'Address not specified'
            },
            client: {
              name: invoice.client_name,
              email: invoice.client_email,
              address: 'Address not specified'
            },
            items: [
              {
                description: invoice.project_description,
                quantity: 1,
                rate: invoice.amount,
                amount: invoice.amount
              }
            ],
            subtotal: invoice.amount,
            tax: 0,
            total: invoice.amount,
            notes: invoice.additional_notes || 'Payment is due within 30 days.',
            paymentMethods: ['crypto', 'bank']
          };
          
          setInvoiceData(transformedData);
        }
      } catch (error) {
        console.error('Error fetching invoice:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoiceData();
  }, [id, router.isReady, supabase]);

  const handleCopyInvoiceUrl = () => {
    const url = `${window.location.origin}/invoice/${id}`;
    navigator.clipboard.writeText(url);
    // You could add a toast notification here
  };

  const handleDownloadPDF = async () => {
    if (!invoiceData) return;
    
    try {
      // Convert to the format expected by generateInvoicePDF
      const invoiceForPDF = {
        id: invoiceData.id,
        user_id: 'sample-user-id', // In real implementation, get from auth
        invoice_number: invoiceData.invoiceNumber,
        due_date: invoiceData.dueDate,
        freelancer_name: invoiceData.merchant.name,
        freelancer_email: invoiceData.merchant.email,
        client_name: invoiceData.client.name,
        client_email: invoiceData.client.email,
        project_description: invoiceData.items.map(item => item.description).join(', '),
        amount: invoiceData.total,
        currency: 'USD' as 'USD' | 'NGN',
        deliverables: invoiceData.notes || '',
        status: 'sent' as const,
        payment_methods: {
          usdc_base: 'sample-address',
          flutterwave: true
        }
      };
      
      const pdfBuffer = await generateInvoicePDF(invoiceForPDF);
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceData.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handlePayment = (method: 'crypto' | 'bank') => {
    // Redirect to payment flow
    router.push(`/payment?invoice=${id}&method=${method}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!invoiceData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Invoice Not Found</h1>
          <p className="text-muted-foreground">The invoice you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Invoice</h1>
            <p className="text-muted-foreground">Invoice #{invoiceData.invoiceNumber}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyInvoiceUrl}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Link
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        <Card className="border border-border shadow-sm">
          <CardContent className="p-8">
            {/* Status and Dates */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <Badge className={getStatusColor(invoiceData.status)}>
                  {invoiceData.status.charAt(0).toUpperCase() + invoiceData.status.slice(1)}
                </Badge>
                <div className="mt-4 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Issue Date:</span>
                    <span className="font-medium">{new Date(invoiceData.issueDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Due Date:</span>
                    <span className="font-medium">{new Date(invoiceData.dueDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  <span className="text-2xl font-bold text-foreground">${invoiceData.total.toLocaleString()}</span>
                </div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
              </div>
            </div>

            {/* Party Information */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="font-semibold text-foreground mb-3">From</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">{invoiceData.merchant.name}</p>
                  <p>{invoiceData.merchant.email}</p>
                  <div className="whitespace-pre-line">{invoiceData.merchant.address}</div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-3">To</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">{invoiceData.client.name}</p>
                  <p>{invoiceData.client.email}</p>
                  <div className="whitespace-pre-line">{invoiceData.client.address}</div>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="mb-8">
              <h3 className="font-semibold text-foreground mb-4">Items</h3>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-4 py-3 grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Amount</div>
                </div>
                {invoiceData.items.map((item, index) => (
                  <div key={index} className="px-4 py-3 grid grid-cols-12 gap-4 text-sm border-t border-border">
                    <div className="col-span-6 font-medium text-foreground">{item.description}</div>
                    <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                    <div className="col-span-2 text-right text-muted-foreground">${item.rate}</div>
                    <div className="col-span-2 text-right font-medium text-foreground">${item.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">${invoiceData.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (10%)</span>
                  <span className="font-medium text-foreground">${invoiceData.tax.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-foreground">
                  <span>Total</span>
                  <span>${invoiceData.total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            {invoiceData.status !== "paid" && (
              <div className="bg-muted/30 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-foreground mb-4">Payment Options</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center gap-3"
                    onClick={() => handlePayment("crypto")}
                  >
                    <Wallet className="w-8 h-8 text-primary" />
                    <div className="text-center">
                      <p className="font-medium">Pay with Crypto</p>
                      <p className="text-xs text-muted-foreground">Connect your wallet</p>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center gap-3"
                    onClick={() => handlePayment("bank")}
                  >
                    <Building className="w-8 h-8 text-primary" />
                    <div className="text-center">
                      <p className="font-medium">Bank Transfer</p>
                      <p className="text-xs text-muted-foreground">Wire transfer or ACH</p>
                    </div>
                  </Button>
                </div>
              </div>
            )}

            {/* Notes */}
            {invoiceData.notes && (
              <div className="border-t border-border pt-6">
                <h3 className="font-semibold text-foreground mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground">{invoiceData.notes}</p>
              </div>
            )}
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

export default Invoice;