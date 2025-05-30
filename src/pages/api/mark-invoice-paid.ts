import type { NextApiRequest, NextApiResponse } from 'next';
import { markInvoiceAsPaid } from '../../lib/supabaseCrud';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { invoiceId } = req.body;
  if (!invoiceId) {
    return res.status(400).json({ error: 'Invoice ID is required' });
  }
  try {
    const updated = await markInvoiceAsPaid(invoiceId);
    res.status(200).json({ invoice: updated });
  } catch {
    res.status(500).json({ error: 'Failed to mark invoice as paid' });
  }
}
