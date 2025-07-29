import { NextApiRequest, NextApiResponse } from 'next';
import TelegramBot from 'node-telegram-bot-api';
import { supabase } from '../../lib/supabase';
import { getBlockExplorerUrl } from '../../lib/cdp';

// Initialize bot for sending notifications
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: false });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[CDP Webhook] Received webhook:', JSON.stringify(req.body, null, 2));

    const { type, data } = req.body;

    // Handle different webhook types
    if (type === 'wallet.transaction.confirmed') {
      await handleTransactionConfirmed(data);
    } else if (type === 'wallet.transaction.pending') {
      await handleTransactionPending(data);
    } else {
      console.log('[CDP Webhook] Unhandled webhook type:', type);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[CDP Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleTransactionConfirmed(data: any) {
  try {
    const { transaction, wallet } = data;
    
    // Check if this is an incoming transaction (deposit)
    if (transaction.to_address && wallet.address === transaction.to_address) {
      await processDepositNotification(transaction, wallet);
    }
  } catch (error) {
    console.error('[CDP Webhook] Error handling transaction confirmed:', error);
  }
}

async function handleTransactionPending(data: any) {
  try {
    const { transaction, wallet } = data;
    
    // For now, we'll only notify on confirmed transactions
    // But we could add pending notifications here if needed
    console.log('[CDP Webhook] Transaction pending:', transaction.hash);
  } catch (error) {
    console.error('[CDP Webhook] Error handling transaction pending:', error);
  }
}

async function processDepositNotification(transaction: any, wallet: any) {
  try {
    // Find the wallet and get the user_id
    const { data: userWallet } = await supabase
      .from('wallets')
      .select('user_id')
      .eq('address', wallet.address)
      .single();

    if (!userWallet) {
      console.log('[CDP Webhook] No wallet found for address:', wallet.address);
      return;
    }

    // Get the user data
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id, telegram_username')
      .eq('id', userWallet.user_id)
      .single();

    if (!user || !user.telegram_chat_id) {
      console.log('[CDP Webhook] No user found for wallet:', wallet.address);
      return;
    }

    const chatId = user.telegram_chat_id;
    
    // Get updated wallet balance for this chain
    const { data: walletBalances } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userWallet.user_id)
      .eq('chain', transaction.network);

    // Format chain name for display
    const formatChainName = (network: string) => {
      const chainNames: Record<string, string> = {
        'base-mainnet': 'Base',
        'base-sepolia': 'Base Sepolia',
        'ethereum-mainnet': 'Ethereum',
        'ethereum-sepolia': 'Ethereum Sepolia',
        'polygon-mainnet': 'Polygon',
        'optimism-mainnet': 'Optimism',
        'optimism-sepolia': 'Optimism Sepolia',
      };
      return chainNames[network] || network;
    };

    // Try to get actual balance from CDP API or use placeholder
    let balanceText = 'Loading...';
    try {
      // This would call CDP API to get current balance
      // For now using placeholder until CDP balance API is integrated
      const amount = parseFloat(transaction.amount || '0');
      const token = transaction.asset?.symbol || 'ETH';
      balanceText = `${amount} ${token} (+ previous balance)`;
    } catch (error) {
      balanceText = 'Unable to fetch current balance';
    }

    // Generate block explorer URL
    const explorerUrl = getBlockExplorerUrl(transaction.hash, transaction.network);

    // Format the deposit notification with all requested information
    const amount = transaction.amount || '0';
    const token = transaction.asset?.symbol || 'ETH';
    const chain = formatChainName(transaction.network || 'unknown');
    const senderAddress = transaction.from_address || 'Unknown';
    const txHash = transaction.hash;

    const message = `🎉 *Crypto Deposit Received!*\n\n` +
      `💰 *Amount Received:* ${amount} ${token}\n` +
      `⛓️ *Chain:* ${chain}\n` +
      `📤 *Sender Address:* \`${senderAddress}\`\n` +
      `💼 *Updated Wallet Balance:* ${balanceText}\n` +
      `🔗 *Transaction Hash:* \`${txHash}\`\n\n` +
      `Your deposit has been confirmed and is now available in your wallet!`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🔍 View on Block Explorer',
            url: explorerUrl
          }
        ]
      ]
    };

    // Send notification to user
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });

    console.log('[CDP Webhook] Deposit notification sent to user:', user.telegram_username);

    // Store transaction in database for tracking
    await supabase
      .from('transactions')
      .upsert({
        user_id: userWallet.user_id,
        transaction_hash: txHash,
        from_address: senderAddress,
        to_address: wallet.address,
        amount: amount,
        currency: token,
        network: transaction.network,
        status: 'confirmed',
        transaction_type: 'deposit',
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'transaction_hash'
      });

  } catch (error) {
    console.error('[CDP Webhook] Error processing deposit notification:', error);
  }
}