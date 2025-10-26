import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { generateContractPDF, ContractPDFData } from '../../../../modules/pdf-generator-contracts';

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

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Contract ID is required' });
    }

    // Fetch contract details from database
    const { data: contract, error } = await supabase
      .from('project_contracts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Fetch milestones
    const { data: milestones } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', id)
      .order('created_at', { ascending: true });

    // Fetch legal contract details
    const { data: legalContract } = await supabase
      .from('legal_contracts')
      .select('*')
      .eq('id', contract.legal_contract_id)
      .single();

    // Get freelancer info
    const { data: user } = await supabase
      .from('auth.users')
      .select('raw_user_meta_data, email')
      .eq('id', contract.freelancer_id)
      .single();

    // Determine token type
    const getTokenType = (tokenAddress: string | null, chain: string): string => {
      if (!tokenAddress) return 'USDC';

      const address = tokenAddress.toLowerCase();

      if (chain === 'base') {
        if (address.includes('833589fcd6edb6e08f4c7c32d4f71b54bda02913')) return 'USDC';
      }

      if (chain === 'celo') {
        if (address.includes('765de816845861e75a25fca122bb6898b8b1282a')) return 'cUSD';
      }

      return legalContract?.token_type || 'USDC';
    };

    // Prepare contract data for PDF generation
    const contractData: ContractPDFData = {
      contractId: id,
      projectTitle: contract.project_title,
      projectDescription: contract.project_description || 'No description provided',
      clientName: legalContract?.client_name || 'Client',
      clientEmail: legalContract?.client_email || contract.client_email,
      freelancerName: user?.raw_user_meta_data?.name || legalContract?.freelancer_name || 'Freelancer',
      totalAmount: contract.total_amount,
      tokenType: getTokenType(contract.token_address, contract.chain),
      chain: contract.chain,
      deadline: contract.deadline,
      status: contract.status,
      createdAt: contract.created_at,
      milestones: milestones?.map(m => ({
        title: m.title,
        description: m.description,
        amount: m.amount,
        deadline: m.due_date,
        status: m.status
      })) || []
    };

    // Generate PDF
    const pdfBuffer = await generateContractPDF(contractData);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contract_${contractData.contractId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF buffer
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate PDF'
    });
  }
}