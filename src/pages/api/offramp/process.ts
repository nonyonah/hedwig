import { NextApiRequest, NextApiResponse } from 'next';
import { offrampService, OfframpRequest } from '../../../services/offrampService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      userId,
      amount,
      token,
      currency,
      bankDetails
    } = req.body;

    // Validate required fields
    if (!userId || !amount || !token || !currency || !bankDetails) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'amount', 'token', 'currency', 'bankDetails']
      });
    }

    // Validate bank details
    const { accountNumber, bankName, bankCode, accountName } = bankDetails;
    if (!accountNumber || !bankName || !bankCode || !accountName) {
      return res.status(400).json({
        error: 'Invalid bank details',
        required: ['accountNumber', 'bankName', 'bankCode', 'accountName']
      });
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be a positive number'
      });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create offramp request
    const offrampRequest: OfframpRequest = {
      userId,
      amount,
      token: token.toUpperCase(),
      currency: currency.toUpperCase(),
      bankDetails: {
        accountNumber,
        bankName,
        bankCode,
        accountName
      }
    };

    // Process the offramp
    const transaction = await offrampService.processOfframp(offrampRequest);

    res.status(200).json({
      success: true,
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        token: transaction.token,
        fiatAmount: transaction.fiatAmount,
        fiatCurrency: transaction.fiatCurrency,
        status: transaction.status,
        txHash: transaction.txHash,
        createdAt: transaction.createdAt
      }
    });
  } catch (error: any) {
    console.error('[API] Offramp process error:', error);
    
    // Handle specific error types
    // TODO: Re-enable KYC error handling once suitable provider is found
    // if (error.message === 'KYC verification required') {
    //   return res.status(403).json({
    //     error: 'KYC verification required',
    //     code: 'KYC_REQUIRED'
    //   });
    // }
    
    if (error.message === 'Insufficient balance') {
      return res.status(400).json({
        error: 'Insufficient balance',
        code: 'INSUFFICIENT_BALANCE'
      });
    }
    
    if (error.message.includes('Unsupported')) {
      return res.status(400).json({
        error: error.message,
        code: 'UNSUPPORTED_ASSET'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}