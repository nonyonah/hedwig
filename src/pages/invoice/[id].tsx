import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useWallet } from '@/providers/WalletProvider';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Invoice {
  id: string;
  invoice_number: string;
  freelancer_name: string;
  freelancer_email: string;
  client_name: string;
  client_email: string;
  project_description: string;
  amount: number;
  currency: string;
  wallet_address: string;
  blockchain: string;
  status: string;
  due_date: string;
  deliverables?: string;
  additional_notes?: string;
}

export default function InvoicePage() {
  const router = useRouter();
  const { id } = router.query;
  const { connectBaseAccount, pay, isConnected, address } = useWallet();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchInvoice(id as string);
    }
  }, [id]);

  const fetchInvoice = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (error) throw error;
      setInvoice(data);
    } catch (err) {
      setError('Invoice not found');
      console.error('Error fetching invoice:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!invoice || !isConnected) return;

    setPaying(true);
    try {
      const result = await pay({
        to: invoice.wallet_address,
        amount: invoice.amount.toString(),
        token: invoice.currency,
        network: invoice.blockchain
      });

      if (result.status === 'success') {
        // Update invoice status
        await supabase
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', invoice.id);

        // Record payment
        await supabase
          .from('payments')
          .insert({
            invoice_id: invoice.id,
            amount_paid: invoice.amount,
            payer_wallet: address,
            tx_hash: result.id,
            status: 'completed'
          });

        alert('Payment successful!');
        router.reload();
      } else {
        throw new Error('Payment failed');
      }
    } catch (err) {
      console.error('Payment error:', err);
      alert('Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading invoice...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500 text-lg">{error || 'Invoice not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <div className="border-b pb-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Invoice {invoice.invoice_number}</h1>
          <p className="text-gray-600 mt-2">From: {invoice.freelancer_name}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Bill To:</h3>
            <p className="text-gray-700">{invoice.client_name}</p>
            <p className="text-gray-600">{invoice.client_email}</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Invoice Details:</h3>
            <p className="text-gray-700">Due Date: {new Date(invoice.due_date).toLocaleDateString()}</p>
            <p className="text-gray-700">Status: <span className={`px-2 py-1 rounded text-sm ${
              invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>{invoice.status}</span></p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Project Details</h3>
          <p className="text-gray-700 mb-4">{invoice.project_description}</p>
          {invoice.deliverables && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Deliverables:</h4>
              <p className="text-gray-700">{invoice.deliverables}</p>
            </div>
          )}
        </div>

        <div className="border-t pt-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-xl font-semibold text-gray-900">Total Amount:</span>
            <span className="text-3xl font-bold text-green-600">
              {invoice.amount} {invoice.currency}
            </span>
          </div>

          {invoice.status !== 'paid' && (
            <div className="space-y-4">
              {!isConnected ? (
                <button
                  onClick={connectBaseAccount}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Connect Wallet to Pay
                </button>
              ) : (
                <button
                  onClick={handlePayment}
                  disabled={paying}
                  className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {paying ? 'Processing Payment...' : `Pay ${invoice.amount} ${invoice.currency}`}
                </button>
              )}
              
              <div className="text-center text-gray-600">
                <p>Payment will be sent to: {invoice.wallet_address}</p>
                <p>Network: {invoice.blockchain}</p>
              </div>
            </div>
          )}

          {invoice.status === 'paid' && (
            <div className="text-center py-4">
              <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Invoice Paid
              </div>
            </div>
          )}
        </div>

        {invoice.additional_notes && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Additional Notes:</h4>
            <p className="text-gray-700">{invoice.additional_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}