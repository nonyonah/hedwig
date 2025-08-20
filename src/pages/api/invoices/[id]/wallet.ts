import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const invoiceId = Array.isArray(id) ? id[0] : id;
    const { walletAddress } = req.body as { walletAddress?: string };

    if (!invoiceId || !walletAddress) {
      return res.status(400).json({ error: 'Missing invoiceId or walletAddress' });
    }

    // Basic EVM address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    // Only set wallet when empty to avoid unintended overwrites
    const { data: existing, error: fetchErr } = await supabase
      .from('invoices')
      .select('id, wallet_address')
      .eq('id', invoiceId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (existing.wallet_address && existing.wallet_address.trim() !== '') {
      return res.status(200).json({ success: true, data: existing, skipped: true });
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({ wallet_address: walletAddress })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) {
      console.error('Failed to persist wallet address to invoice:', error);
      return res.status(500).json({ error: 'Failed to update invoice wallet address' });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Error in invoices/[id]/wallet:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
