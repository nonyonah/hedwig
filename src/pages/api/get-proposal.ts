import type { NextApiRequest, NextApiResponse } from 'next';
import { ProposalService } from '@/lib/proposalService';
import { loadServerEnvironment } from '@/lib/serverEnv';

loadServerEnvironment();

interface GetProposalResponse {
  success: boolean;
  proposal?: any;
  summary?: any;
  html?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetProposalResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { proposalId, userId, format = 'json', includeSummary = 'false' } = req.query;

    if (!proposalId || typeof proposalId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'proposalId is required'
      });
    }

    // Get proposal
    const proposal = await ProposalService.getProposal(
      proposalId,
      typeof userId === 'string' ? userId : undefined
    );

    if (!proposal) {
      return res.status(404).json({
        success: false,
        error: 'Proposal not found'
      });
    }

    let summary;
    let html;

    // Generate summary if requested
    if (includeSummary === 'true') {
      summary = await ProposalService.generateProposalSummary(
        proposalId,
        typeof userId === 'string' ? userId : undefined
      );
    }

    // Generate HTML if requested
    if (format === 'html' && summary) {
      html = ProposalService.generateProposalHTML(summary);
      
      // If HTML format is requested, return HTML directly
      res.setHeader('Content-Type', 'text/html');
      res.status(200);
      return res.end(html);
    }

    return res.status(200).json({
      success: true,
      proposal,
      summary,
      html
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}