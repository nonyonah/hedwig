import { NextApiRequest, NextApiResponse } from 'next';
import { createProposal, CreateProposalParams, CreateProposalResult } from '@/lib/proposalservice';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateProposalResult>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const params: CreateProposalParams = req.body;
    const result = await createProposal(params);

    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('Proposal creation API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}