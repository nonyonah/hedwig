import type { NextApiRequest, NextApiResponse } from 'next';
import { handleAlchemyWebhook } from '@/api/actions';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return handleAlchemyWebhook(req, res);
}