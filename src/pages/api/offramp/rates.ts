import { NextApiRequest, NextApiResponse } from 'next';
import { rateQueryService } from '../../../services/rateQueryService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, amount } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token parameter is required' });
    }

    const parsedAmount = amount ? parseFloat(amount as string) : 1;
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount parameter' });
    }

    // Use the dedicated rate query service for standalone rate requests
    const result = await rateQueryService.getRatesForToken(token, parsedAmount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[API] Error fetching rates:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}