import { NextApiRequest, NextApiResponse } from 'next';
import TelegramBot from 'node-telegram-bot-api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: 'Bot token not configured' });
    }

    const bot = new TelegramBot(botToken, { polling: false });

    // Set bot commands
    await bot.setMyCommands([
      { command: 'start', description: 'Start Hedwig Bot' },
      { command: 'help', description: 'Get help' },
      { command: 'balance', description: 'Check wallet balance' },
      { command: 'wallet', description: 'View wallet address' },
      { command: 'send', description: 'Send crypto' },
      { command: 'offramp', description: 'Withdraw to bank account' },
      { command: 'payment', description: 'Create payment link' },
      { command: 'invoice', description: 'Create invoice' },
      { command: 'proposal', description: 'Create proposal' },
      { command: 'contract', description: 'Create binding contracts' },
      { command: 'milestone', description: 'Submit milestone completion' },
      { command: 'milestones', description: 'View my milestones' },
      { command: 'earnings_summary', description: 'View earnings summary' },
      { command: 'business_dashboard', description: 'Business dashboard' },
      { command: 'referral', description: 'Get your referral link and stats' },
      { command: 'leaderboard', description: 'View referral leaderboard' },
      { command: 'onramp', description: 'Purchase cryptocurrency' }
    ]);

    return res.status(200).json({ 
      success: true, 
      message: 'Bot commands refreshed successfully' 
    });

  } catch (error) {
    console.error('Error refreshing bot commands:', error);
    return res.status(500).json({ 
      error: 'Failed to refresh bot commands',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}