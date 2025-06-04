import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Create invoice
    const { freelancer_name, freelancer_email, client_name, client_email, project_description, deliverables, price, amount, is_split_payment, split_details, milestones, wallet_address, blockchain } = req.body;
    const { data, error } = await supabase.from('invoices').insert([
      {
        freelancer_name,
        freelancer_email,
        client_name,
        client_email,
        project_description,
        deliverables,
        price,
        amount,
        is_split_payment,
        split_details,
        milestones,
        wallet_address,
        blockchain,
        status: 'draft',
      }
    ]).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ invoice: data?.[0] });
  }
  if (req.method === 'GET') {
    // Fetch invoices (optionally by client or freelancer)
    const { client_email, freelancer_email, id } = req.query;
    let query = supabase.from('invoices').select('*');
    if (id) query = query.eq('id', id);
    if (client_email) query = query.eq('client_email', client_email);
    if (freelancer_email) query = query.eq('freelancer_email', freelancer_email);
    const { data, error } = await query.order('date_created', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ invoices: data });
  }
  if (req.method === 'PATCH') {
    // Update invoice status
    const { id, status } = req.body;
    const { data, error } = await supabase.from('invoices').update({ status }).eq('id', id).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ invoice: data?.[0] });
  }
  res.status(405).json({ error: 'Method not allowed' });
}
