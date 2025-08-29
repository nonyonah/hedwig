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
    const { currency } = req.query;

    if (!currency) {
      return res.status(400).json({
        error: 'Currency is required',
        example: '/api/offramp/banks?currency=NGN'
      });
    }

    const currencyStr = Array.isArray(currency) ? currency[0] : currency;

    // Validate supported currencies
    const supportedCurrencies = ['NGN', 'KES'];
    if (!supportedCurrencies.includes(currencyStr.toUpperCase())) {
      return res.status(400).json({
        error: `Unsupported currency: ${currencyStr}`,
        supportedCurrencies
      });
    }

    const banks = await offrampService.getSupportedBanks(currencyStr);

    res.status(200).json({
      success: true,
      currency: currencyStr.toUpperCase(),
      banks,
      count: banks.length
    });
  } catch (error: any) {
    console.error('[API] Banks error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}