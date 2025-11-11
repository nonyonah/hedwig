import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      // Fetch the invoice first without joins to avoid relationship errors
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Get wallet address directly from invoice table (like payment links do)
      const walletAddress = (invoice as any).wallet_address || '';

      // Calculate subtotal, tax, and total
      const quantity = parseFloat(String(invoice.quantity)) || 1;
      const rate = parseFloat(String(invoice.rate || invoice.amount || invoice.price || 0));
      
      // Validate the rate
      if (isNaN(rate) || !isFinite(rate) || rate < 0) {
        return res.status(400).json({ error: 'Invalid invoice amount format' });
      }
      
      const subtotal = quantity * rate;
      // Create items array from invoice data
      let items: any[];
      let calculatedSubtotal: number;
      let calculatedTotal: number;

      // Check if invoice has items array (new format) or use single item format (backward compatibility)
      if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
        // New multi-item format
        items = invoice.items.map((item: any, index: number) => ({
          id: String(index + 1),
          description: item.description || 'Service',
          quantity: item.quantity || 1,
          rate: item.rate || 0,
          amount: item.amount || 0
        }));

        // Calculate totals from items array
        calculatedSubtotal = items.reduce((sum, item) => sum + item.amount, 0);
      } else {
        // Backward compatibility: single item format
        items = [{
          id: '1',
          description: invoice.project_description || 'Service',
          quantity: quantity,
          rate: rate,
          amount: subtotal
        }];

        calculatedSubtotal = subtotal;
      }

      const taxRate = 0.08; // 8% tax
      const tax = calculatedSubtotal * taxRate;
      calculatedTotal = calculatedSubtotal + tax;

      // Transform database data to match frontend interface
      const transformedInvoice = {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number || `INV-${invoice.id.slice(0, 8)}`,
        status: invoice.status || 'draft',
        issueDate: invoice.date_created || new Date().toISOString(),
        dueDate: invoice.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        fromCompany: {
          name: invoice.freelancer_name || 'Freelancer',
          address: invoice.freelancer_address || '',
          email: invoice.freelancer_email || '',
          phone: invoice.freelancer_phone || '',
          walletAddress: walletAddress || ''
        },
        toCompany: {
          name: invoice.client_name || 'Client',
          address: invoice.client_address || '',
          email: invoice.client_email || '',
          phone: invoice.client_phone || ''
        },
        items: items,
        subtotal: calculatedSubtotal,
        tax: tax,
        total: calculatedTotal,
        notes: invoice.additional_notes || 'Thank you for your business!',
        paymentTerms: invoice.payment_instructions || '',
        paymentTransaction: invoice.payment_transaction || null,
        paidAt: invoice.paid_at || null
      };

      res.status(200).json(transformedInvoice);
    } catch (error) {
      console.error('Error fetching invoice:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}