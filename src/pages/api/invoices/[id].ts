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

      // Transform database data to match frontend interface
      const transformedInvoice = {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        status: invoice.status,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        fromCompany: {
          name: invoice.sender_name,
          address: invoice.sender_address,
          email: invoice.sender_email,
          phone: invoice.sender_phone || ''
        },
        toCompany: {
          name: invoice.client_name,
          address: invoice.client_address,
          email: invoice.client_email,
          phone: invoice.client_phone || ''
        },
        items: invoice.items || [],
        subtotal: invoice.subtotal,
        tax: invoice.tax || 0,
        total: invoice.total_amount,
        notes: invoice.notes,
        paymentTerms: invoice.payment_terms || 'Net 30'
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