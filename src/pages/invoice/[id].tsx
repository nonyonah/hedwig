import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Download, Send, Wallet, CreditCard, Calendar, User, Building, FileText, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

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

export default function InvoicePage() {
  const router = useRouter();
  const { id } = router.query;
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'crypto' | 'bank'>('crypto');

  // Sample data - replace with actual API call
  useEffect(() => {
    if (id) {
      // Simulate API call
      setTimeout(() => {
        setInvoiceData({
          id: id as string,
          invoiceNumber: 'INV-2024-001',
          status: 'sent',
          issueDate: '2024-01-15',
          dueDate: '2024-02-15',
          fromCompany: {
            name: 'Acme Corp',
            address: '123 Business St, Suite 100\nNew York, NY 10001',
            email: 'billing@acmecorp.com',
            phone: '+1 (555) 123-4567'
          },
          toCompany: {
            name: 'Client Company LLC',
            address: '456 Client Ave\nLos Angeles, CA 90210',
            email: 'accounts@clientco.com',
            phone: '+1 (555) 987-6543'
          },
          items: [
            {
              id: '1',
              description: 'Website Design & Development',
              quantity: 1,
              rate: 2500.00,
              amount: 2500.00
            },
            {
              id: '2',
              description: 'Content Management System Setup',
              quantity: 1,
              rate: 800.00,
              amount: 800.00
            },
            {
              id: '3',
              description: 'SEO Optimization',
              quantity: 1,
              rate: 500.00,
              amount: 500.00
            }
          ],
          subtotal: 3800.00,
          tax: 304.00,
          total: 4104.00,
          notes: 'Thank you for your business! Payment is due within 30 days.',
          paymentTerms: 'Net 30'
        });
        setLoading(false);
      }, 1000);
    }
  }, [id]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Invoice link copied to clipboard');
  };

  const handleDownloadPDF = () => {
    // Implement PDF download logic
    toast.success('PDF download started');
  };

  const handleSendInvoice = () => {
    // Implement send invoice logic
    toast.success('Invoice sent successfully');
  };

  const handlePayment = () => {
    // Implement payment logic
    toast.info('Redirecting to payment...');
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
                  <span className="text-gray-600">Tax (8%):</span>
                  <span className="font-medium">${invoiceData.tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between py-3">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-lg font-bold text-blue-600">${invoiceData.total.toFixed(2)}</span>
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
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Button
                  variant={paymentMethod === 'crypto' ? 'default' : 'outline'}
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={() => setPaymentMethod('crypto')}
                >
                  <Wallet className="h-6 w-6 mb-2" />
                  <span>Crypto Payment</span>
                </Button>
                <Button
                  variant={paymentMethod === 'bank' ? 'default' : 'outline'}
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={() => setPaymentMethod('bank')}
                >
                  <CreditCard className="h-6 w-6 mb-2" />
                  <span>Bank Transfer</span>
                </Button>
              </div>

              <div className="text-center">
                <Button onClick={handlePayment} className="bg-blue-600 hover:bg-blue-700 px-8">
                  Pay ${invoiceData.total.toFixed(2)} via {paymentMethod === 'crypto' ? 'Crypto' : 'Bank Transfer'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}