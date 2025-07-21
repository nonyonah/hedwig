import type { NextApiRequest, NextApiResponse } from 'next';
import { ProposalService, ProposalData } from '@/lib/proposalService';
import { loadServerEnvironment } from '@/lib/serverEnv';

loadServerEnvironment();

interface CreateProposalRequest {
  userId: string;
  proposalData: ProposalData;
  walletAddress?: string;
  userName?: string;
  token?: string;
  network?: string;
  createPaymentLink?: boolean;
}

interface CreateProposalResponse {
  success: boolean;
  proposal?: any;
  paymentLink?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateProposalResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const {
      userId,
      proposalData,
      walletAddress,
      userName,
      token = 'USDC',
      network = 'base',
      createPaymentLink = false
    }: CreateProposalRequest = req.body;

    // Validate required fields
    if (!userId || !proposalData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, proposalData'
      });
    }

    // Validate proposal data
    const requiredFields = [
      'clientName', 'projectTitle', 'description', 'deliverables',
      'timelineStart', 'timelineEnd', 'paymentAmount', 'paymentMethod', 'serviceFee'
    ];

    for (const field of requiredFields) {
      if (!proposalData[field as keyof ProposalData]) {
        return res.status(400).json({
          success: false,
          error: `Missing required proposal field: ${field}`
        });
      }
    }

    // Validate dates
    const startDate = new Date(proposalData.timelineStart);
    const endDate = new Date(proposalData.timelineEnd);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format for timeline'
      });
    }

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        error: 'End date must be after start date'
      });
    }

    // Validate amounts
    if (proposalData.paymentAmount <= 0 || proposalData.serviceFee < 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment amount must be positive and service fee must be non-negative'
      });
    }

    // Validate payment method
    if (!['crypto', 'bank', 'mixed'].includes(proposalData.paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: 'Payment method must be crypto, bank, or mixed'
      });
    }

    // Validate email if provided
    if (proposalData.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(proposalData.clientEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Create proposal
    const proposal = await ProposalService.createProposal(userId, proposalData);

    let paymentLink: string | undefined;

    // Create payment link if requested
    if (createPaymentLink && walletAddress && userName) {
      // Validate wallet address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address format'
        });
      }

      const paymentLinkResult = await ProposalService.createPaymentLinkForProposal(
        proposal,
        walletAddress,
        userName,
        token,
        network
      );

      if (paymentLinkResult) {
        paymentLink = paymentLinkResult;
      } else {
        console.warn('Failed to create payment link for proposal:', proposal.id);
      }
    }

    return res.status(201).json({
      success: true,
      proposal,
      paymentLink
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}