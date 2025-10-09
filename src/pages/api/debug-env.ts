import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check environment variables (without exposing sensitive values)
    const envCheck = {
      // Telegram
      TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_BOT_TOKEN_LENGTH: process.env.TELEGRAM_BOT_TOKEN?.length || 0,
      
      // Paycrest
      PAYCREST_API_KEY: !!process.env.PAYCREST_API_KEY,
      PAYCREST_API_SECRET: !!process.env.PAYCREST_API_SECRET,
      PAYCREST_API_TOKEN: !!process.env.PAYCREST_API_TOKEN,
      PAYCREST_WEBHOOK_SECRET: !!process.env.PAYCREST_WEBHOOK_SECRET,
      PAYCREST_API_SECRET_VALUE: process.env.PAYCREST_API_SECRET === 'your_paycrest_mainnet_secret_here' ? 'PLACEHOLDER' : 'SET',
      
      // Alchemy
      ALCHEMY_API_KEY: !!process.env.ALCHEMY_API_KEY,
      ALCHEMY_AUTH_TOKEN: !!process.env.ALCHEMY_AUTH_TOKEN,
      ALCHEMY_SIGNING_KEY: !!process.env.ALCHEMY_SIGNING_KEY,
      ALCHEMY_WEBHOOK_SECRET: !!process.env.ALCHEMY_WEBHOOK_SECRET,
      
      // Supabase
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      
      // App URLs
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      
      // Node environment
      NODE_ENV: process.env.NODE_ENV,
      
      // Total env vars loaded
      TOTAL_ENV_VARS: Object.keys(process.env).length
    };

    return res.status(200).json({
      success: true,
      environment: envCheck,
      message: 'Environment variables check completed'
    });

  } catch (error: any) {
    console.error('Debug env error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}