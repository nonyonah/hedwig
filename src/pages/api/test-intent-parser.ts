import type { NextApiRequest, NextApiResponse } from 'next';
import { parseIntentAndParams } from '../../lib/intentParser';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text parameter required' });
  }

  try {
    const result = parseIntentAndParams(text);
    
    res.status(200).json({
      input: text,
      result: result,
      success: true
    });
  } catch (error) {
    res.status(500).json({
      input: text,
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    });
  }
}