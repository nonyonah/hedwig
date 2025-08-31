import { NextApiRequest, NextApiResponse } from 'next';
import { handleAction } from '../../../api/actions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { userId, txHash, orderId } = req.body;

    if (!userId || !txHash || !orderId) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    const result = await handleAction('offramp_submit', { txHash, orderId }, userId);

    return res.status(200).json(result);
  } catch (error) {
    console.error('[SUBMIT_OFFRAMP_API] Error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}