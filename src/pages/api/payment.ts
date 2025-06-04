import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Record payment
    const { invoice_id, amount_paid, payer_wallet, tx_hash, status } = req.body;
    const { data, error } = await supabase.from('payments').insert([
      {
        invoice_id,
        amount_paid,
        payer_wallet,
        tx_hash,
        status: status || 'pending',
      }
    ]).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ payment: data?.[0] });
  }
  if (req.method === 'GET') {
    // Fetch payments for an invoice
    const { invoice_id } = req.query;
    if (!invoice_id) return res.status(400).json({ error: 'invoice_id required' });
    const { data, error } = await supabase.from('payments').select('*').eq('invoice_id', invoice_id).order('payment_date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ payments: data });
  }
  res.status(405).json({ error: 'Method not allowed' });
}
