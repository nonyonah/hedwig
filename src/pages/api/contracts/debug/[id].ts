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
    const { id } = req.query;
    console.log('[Contract Debug] Checking contract:', id);

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Contract ID is required' });
    }

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select('*')
      .eq('id', id)
      .single();

    if (contractError) {
      console.log('[Contract Debug] Error fetching contract:', contractError);
      return res.status(404).json({ 
        error: 'Contract not found',
        details: contractError 
      });
    }

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    console.log('[Contract Debug] Contract found:', {
      id: contract.id,
      status: contract.status,
      project_title: contract.project_title
    });

    res.status(200).json({
      success: true,
      contract: {
        id: contract.id,
        contract_id: contract.contract_id,
        status: contract.status,
        project_title: contract.project_title,
        created_at: contract.created_at,
        legal_contract_hash: contract.legal_contract_hash
      }
    });

  } catch (error) {
    console.error('[Contract Debug] Error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}