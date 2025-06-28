import type { NextApiRequest, NextApiResponse } from 'next';
import { handleAlchemyWebhook } from '@/api/actions';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return handleAlchemyWebhook(req, res);
} 