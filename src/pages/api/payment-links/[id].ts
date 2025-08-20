import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const paymentId = Array.isArray(id) ? id[0] : id;
    if (!paymentId) return res.status(400).json({ error: 'Missing id' });

    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching payment link:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
