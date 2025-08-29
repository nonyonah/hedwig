import { NextApiRequest, NextApiResponse } from 'next';
import { offrampService } from '../../../services/offrampService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountNumber, bankCode, currency } = req.body;

    // Validate required fields
    if (!accountNumber || !bankCode || !currency) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['accountNumber', 'bankCode', 'currency']
      });
    }

    // Validate account number format
    if (typeof accountNumber !== 'string' || accountNumber.length < 10) {
      return res.status(400).json({
        error: 'Invalid account number format'
      });
    }

    // Validate supported currencies
    const supportedCurrencies = ['NGN', 'KES'];
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
      return res.status(400).json({
        error: `Unsupported currency: ${currency}`,
        supportedCurrencies
      });
    }

    const verification = await offrampService.verifyBankAccount(
      accountNumber,
      bankCode,
      currency
    );

    res.status(200).json({
      success: true,
      verification: {
        isValid: verification.isValid,
        accountName: verification.accountName,
        accountNumber,
        bankCode
      }
    });
  } catch (error: any) {
    console.error('[API] Bank account verification error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}