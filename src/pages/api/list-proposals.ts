import { NextApiRequest, NextApiResponse } from 'next';
import { listProposals, ProposalListItem } from '../../lib/proposalService';

interface ListProposalsRequest {
  userIdentifier?: string;
}

interface ListProposalsResponse {
  success: boolean;
  proposals?: ProposalListItem[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListProposalsResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { userIdentifier }: ListProposalsRequest = req.body;

    // List proposals
    const result = await listProposals(userIdentifier);

    if (result.success) {
      return res.status(200).json({
        success: true,
        proposals: result.proposals
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to list proposals'
      });
    }
  } catch (error) {
    console.error('Error in list-proposals API:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}