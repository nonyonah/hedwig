import { NextApiRequest, NextApiResponse } from 'next';
import { offrampService } from '../../../services/offrampService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, amount } = req.query;

    if (!token || !amount) {
      return res.status(400).json({
        error: 'Token and amount are required',
        example: '/api/offramp/rates?token=USDC&amount=100'
      });
    }

    const tokenStr = Array.isArray(token) ? token[0] : token;
    const amountNum = parseFloat(Array.isArray(amount) ? amount[0] : amount);

    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        error: 'Amount must be a positive number'
      });
    }

    // Validate supported tokens
    const supportedTokens = ['USDT', 'USDC'];
    if (!supportedTokens.includes(tokenStr.toUpperCase())) {
      return res.status(400).json({
        error: `Unsupported token: ${tokenStr}`,
        supportedTokens
      });
    }

    const rates = await offrampService.getExchangeRates(tokenStr, amountNum);

    res.status(200).json({
      success: true,
      token: tokenStr.toUpperCase(),
      amount: amountNum,
      rates,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[API] Exchange rates error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}