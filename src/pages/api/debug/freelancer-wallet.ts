import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contractId, email, userId } = req.query;

  if (!contractId && !email && !userId) {
    return res.status(400).json({ error: 'contractId, email, or userId is required' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result: any = {
      contractId,
      email,
      userId,
      contract: null,
      legalContract: null,
      user: null,
      wallets: [],
      resolvedWallet: null
    };

    // If contractId provided, fetch contract details
    if (contractId) {
      const { data: contract } = await supabase
        .from('project_contracts')
        .select('*')
        .eq('id', contractId)
        .single();
      
      result.contract = contract;

      if (contract?.legal_contract_hash) {
        const { data: legalContract } = await supabase
          .from('legal_contracts')
          .select('*')
          .eq('id', contract.legal_contract_hash)
          .single();
        
        result.legalContract = legalContract;
      }

      // Try to get freelancer wallet using freelancer_id
      if (contract?.freelancer_id) {
        const { data: wallets } = await supabase
          .from('wallets')
          .select('address, chain, created_at')
          .eq('user_id', contract.freelancer_id)
          .order('created_at', { ascending: true });

        result.wallets = wallets || [];

        if (wallets && wallets.length > 0) {
          const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
          result.resolvedWallet = evmWallet?.address || wallets[0]?.address || null;
        }
      }
    }

    // If email provided, find user and their wallets
    if (email) {
      const { data: user } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('email', email)
        .single();

      result.user = user;

      if (user) {
        const { data: wallets } = await supabase
          .from('wallets')
          .select('address, chain, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        result.wallets = [...(result.wallets || []), ...(wallets || [])];

        if (wallets && wallets.length > 0) {
          const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
          result.resolvedWallet = result.resolvedWallet || evmWallet?.address || wallets[0]?.address || null;
        }
      }
    }

    // If userId provided, get user and wallets
    if (userId) {
      const { data: user } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('id', userId)
        .single();

      result.user = user;

      const { data: wallets } = await supabase
        .from('wallets')
        .select('address, chain, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      result.wallets = wallets || [];

      if (wallets && wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
        result.resolvedWallet = evmWallet?.address || wallets[0]?.address || null;
      }
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Debug freelancer wallet error:', error);
    return res.status(500).json({ 
      error: 'Failed to debug freelancer wallet',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}