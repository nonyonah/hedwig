import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    status: 'ok',
    message: 'Albus API is running',
    timestamp: new Date().toISOString(),
  });
}
