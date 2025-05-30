import type { NextApiRequest, NextApiResponse } from 'next';
import { generateInvoiceFromPrompt } from '../../lib/invoiceFromPrompt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { userId, clientId, prompt } = req.body;
  if (!userId || !clientId || !prompt) {
    return res.status(400).json({ error: 'userId, clientId, and prompt are required' });
  }
  try {
    const invoice = await generateInvoiceFromPrompt(userId, clientId, prompt);
    res.status(200).json({ invoice });
  } catch {
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
}
