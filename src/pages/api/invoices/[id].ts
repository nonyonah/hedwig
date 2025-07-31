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
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Calculate subtotal, tax, and total
      const quantity = invoice.quantity || 1;
      const rate = invoice.rate || invoice.amount || invoice.price || 0;
      const subtotal = quantity * rate;
      const taxRate = 0.08; // 8% tax
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      // Create items array from invoice data
      const items = [{
        id: '1',
        description: invoice.project_description || 'Service',
        quantity: quantity,
        rate: rate,
        amount: subtotal
      }];

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
          phone: invoice.freelancer_phone || ''
        },
        toCompany: {
          name: invoice.client_name || 'Client',
          address: invoice.client_address || '',
          email: invoice.client_email || '',
          phone: invoice.client_phone || ''
        },
        items: items,
        subtotal: subtotal,
        tax: tax,
        total: total,
        notes: invoice.additional_notes || 'Thank you for your business!',
        paymentTerms: invoice.payment_instructions || 'Net 30'
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