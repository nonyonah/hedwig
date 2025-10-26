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

    if (id) {
      // Debug specific contract
      console.log('Debugging contract ID:', id);

      // Check project_contracts table
      const { data: projectContract, error: projectError } = await supabase
        .from('project_contracts')
        .select('*')
        .eq('id', id)
        .single();

      // Check contracts table
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .single();

      // Check legal_contracts table
      const { data: legalContract, error: legalError } = await supabase
        .from('legal_contracts')
        .select('*')
        .eq('id', id)
        .single();

      return res.status(200).json({
        contractId: id,
        projectContract: { data: projectContract, error: projectError },
        contract: { data: contract, error: contractError },
        legalContract: { data: legalContract, error: legalError }
      });
    } else {
      // List all contracts
      const { data: projectContracts } = await supabase
        .from('project_contracts')
        .select('id, project_title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: contracts } = await supabase
        .from('contracts')
        .select('id, title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: legalContracts } = await supabase
        .from('legal_contracts')
        .select('id, project_title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      return res.status(200).json({
        projectContracts: projectContracts || [],
        contracts: contracts || [],
        legalContracts: legalContracts || []
      });
    }
  } catch (error) {
    console.error('Debug contracts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}