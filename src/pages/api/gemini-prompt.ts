import type { NextApiRequest, NextApiResponse } from 'next';
import { processPrompt } from '../../lib/gemini';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  try {
    const result = await processPrompt(prompt);
    res.status(200).json({ result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process prompt' });
  }
}
