import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contractId } = req.query;

    if (!contractId) {
      return res.status(400).json({ error: 'Contract ID is required' });
    }

    // Check milestones for the contract
    const { data: milestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at');

    // Check invoices for the contract
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .eq('project_contract_id', contractId)
      .order('created_at');

    return res.status(200).json({
      contractId,
      milestones: {
        data: milestones || [],
        error: milestonesError,
        count: milestones?.length || 0
      },
      invoices: {
        data: invoices || [],
        error: invoicesError,
        count: invoices?.length || 0
      }
    });

  } catch (error) {
    console.error('Debug milestones error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}