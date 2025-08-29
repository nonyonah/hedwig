import { NextApiRequest, NextApiResponse } from 'next';
import { offrampService } from '../../../services/offrampService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { method } = req;

  switch (method) {
    case 'GET':
      return handleGetKYCStatus(req, res);
    case 'POST':
      return handleInitiateKYC(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Get KYC status for a user
 */
async function handleGetKYCStatus(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const kycStatus = await offrampService.checkKYCStatus(userId);

    res.status(200).json({
      success: true,
      kyc: kycStatus
    });
  } catch (error: any) {
    console.error('[API] KYC status check error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}

/**
 * Initiate KYC process for a user
 */
async function handleInitiateKYC(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.email) {
      return res.status(400).json({ 
        error: 'User email is required for KYC verification' 
      });
    }

    // Check if KYC is already completed
    const currentStatus = await offrampService.checkKYCStatus(userId);
    if (currentStatus.status === 'verified') {
      return res.status(200).json({
        success: true,
        message: 'KYC already verified',
        kyc: currentStatus
      });
    }

    // Initiate KYC process
    const kycData = await offrampService.initiateKYC(userId, user.email);

    res.status(200).json({
      success: true,
      message: 'KYC process initiated',
      kycUrl: kycData.kycUrl,
      kycId: kycData.kycId
    });
  } catch (error: any) {
    console.error('[API] KYC initiation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}