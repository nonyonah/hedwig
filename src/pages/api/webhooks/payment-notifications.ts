import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
const TelegramBot = require('node-telegram-bot-api');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validate Telegram bot configuration
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not configured');
}

const bot = process.env.TELEGRAM_BOT_TOKEN 
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
  : null;

interface PaymentNotificationData {
  type: 'invoice' | 'payment_link' | 'proposal' | 'direct_transfer' | 'offramp';
  id: string;
  amount: number;
  currency: string;
  transactionHash?: string;
  payerWallet?: string;
  recipientWallet?: string;
  status: 'paid' | 'completed' | 'failed';
  chain?: string;
  senderAddress?: string;
  recipientUserId?: string;
  // Additional fields for CDP webhook integration
  freelancerName?: string;
  clientName?: string;
  userName?: string;
  paymentReason?: string;
  // Additional fields for offramp notifications
  orderId?: string;
  liquidityProvider?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Payment notification webhook received:', JSON.stringify(req.body, null, 2));
    
    const { 
      type, id, amount, currency, transactionHash, payerWallet, recipientWallet, status,
      senderAddress, recipientUserId, chain, freelancerName, clientName, userName, paymentReason
    } = req.body as PaymentNotificationData;

    console.log('Parsed notification data:', { type, id, amount, currency, recipientUserId, status });

    if (!type || !id || !amount || !status) {
      console.error('Missing required fields:', { type, id, amount, status });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check for duplicate notifications using transaction hash
    if (transactionHash) {
      const { data: existingNotification, error: notificationError } = await supabase
        .from('payments')
        .select('id, notification_sent')
        .eq('tx_hash', transactionHash)
        .eq('notification_sent', true)
        .single();

      if (existingNotification && !notificationError) {
        console.log(`⏭️ Notification already sent for transaction: ${transactionHash}`);
        return res.status(200).json({ success: true, message: 'Notification already sent' });
      }
    }

    // Get the recipient user information
    let recipientUser;
    let itemData;

    if (type === 'invoice') {
      // If CDP provided user data, use it; otherwise fetch from database
      if (recipientUserId && freelancerName && clientName) {
        // Use CDP-provided data for efficiency
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id, name, email, telegram_chat_id')
          .eq('id', recipientUserId)
          .single();

        if (userError || !user) {
          console.error('Error fetching user:', userError);
          return res.status(404).json({ error: 'User not found' });
        }

        recipientUser = user;
        itemData = {
          number: `INV-${id.slice(-8)}`, // Generate invoice number from ID
          description: 'Invoice Payment',
          clientName: clientName,
          freelancerName: freelancerName
        };
      } else {
        // Fallback to database query
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .select(`
            *,
            users!invoices_created_by_fkey(id, name, email, telegram_chat_id)
          `)
          .eq('id', id)
          .single();

        if (invoiceError || !invoice) {
          console.error('Error fetching invoice:', invoiceError);
          return res.status(404).json({ error: 'Invoice not found' });
        }

        recipientUser = invoice.users;
        itemData = {
          number: invoice.invoice_number,
          description: invoice.project_description,
          clientName: invoice.client_name,
          clientEmail: invoice.client_email
        };
      }
    } else if (type === 'payment_link') {
      // If CDP provided user data, use it; otherwise fetch from database
      if (recipientUserId && userName && paymentReason) {
        // Use CDP-provided data for efficiency
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id, name, email, telegram_chat_id')
          .eq('id', recipientUserId)
          .single();

        if (userError || !user) {
          console.error('Error fetching user:', userError);
          return res.status(404).json({ error: 'User not found' });
        }

        recipientUser = user;
        itemData = {
          id: id,
          title: `Payment from ${userName}`,
          description: paymentReason,
          recipientName: userName,
          paymentReason: paymentReason,
          user_name: user.name, // Use actual user's name instead of 'Hedwig User'
          recipientEmail: userName // If userName is an email, use it as recipientEmail
        };
      } else {
        // Fallback to database query
        const { data: paymentLink, error: linkError } = await supabase
          .from('payment_links')
          .select(`
            *,
            users!payment_links_created_by_fkey(id, name, email, telegram_chat_id)
          `)
          .eq('id', id)
          .single();

        if (linkError || !paymentLink) {
          console.error('Error fetching payment link:', linkError);
          return res.status(404).json({ error: 'Payment link not found' });
        }

        recipientUser = paymentLink.users;
        itemData = {
          id: paymentLink.id,
          title: paymentLink.user_name,
          description: paymentLink.payment_reason,
          recipientName: paymentLink.user_name,
          recipientEmail: paymentLink.recipient_email,
          user_name: paymentLink.users.name // Use actual user's name instead of 'Hedwig User'
        };
      }
    } else if (type === 'proposal') {
      // Get proposal data
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', id)
        .single();

      if (proposalError || !proposal) {
        console.error('Error fetching proposal:', proposalError);
        return res.status(404).json({ error: 'Proposal not found' });
      }

      // Get the user who created the proposal using user_identifier
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, email, telegram_chat_id')
        .eq('id', proposal.user_identifier)
        .single();

      if (userError || !user) {
        console.error('Error fetching user for proposal:', userError);
        return res.status(404).json({ error: 'User not found for proposal' });
      }

      recipientUser = user;
      itemData = {
        number: proposal.proposal_number,
        description: proposal.project_description || proposal.description,
        clientName: proposal.client_name,
        clientEmail: proposal.client_email,
        projectTitle: proposal.project_title
      };
    } else if (type === 'direct_transfer') {
      // For direct transfers, we get the recipient user ID directly
      console.log('Processing direct transfer notification for recipientUserId:', req.body.recipientUserId);
      
      if (!req.body.recipientUserId) {
        console.error('No recipient user ID provided for direct transfer');
        return res.status(400).json({ error: 'Recipient user ID required for direct transfer' });
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, email, telegram_chat_id')
        .eq('id', req.body.recipientUserId)
        .single();

      if (userError || !user) {
        console.error('Error fetching user for direct transfer:', userError);
        console.error('User lookup failed for ID:', req.body.recipientUserId);
        return res.status(404).json({ error: 'User not found' });
      }

      console.log('Found user for direct transfer:', { id: user.id, name: user.name, hasTelegramChatId: !!user.telegram_chat_id });
      
      recipientUser = user;
      itemData = {
        senderAddress: req.body.senderAddress,
        recipientWallet: req.body.recipientWallet,
        chain: req.body.chain
      };
      
      console.log('Direct transfer itemData:', itemData);
    } else if (type === 'offramp') {
      // For offramp transactions, get the user from the transaction
      if (!req.body.recipientUserId) {
        console.error('No recipient user ID provided for offramp');
        return res.status(400).json({ error: 'Recipient user ID required for offramp' });
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, email, telegram_chat_id')
        .eq('id', req.body.recipientUserId)
        .single();

      if (userError || !user) {
        console.error('Error fetching user for offramp:', userError);
        return res.status(404).json({ error: 'User not found' });
      }

      recipientUser = user;
      itemData = {
        orderId: req.body.orderId,
        liquidityProvider: req.body.liquidityProvider,
        transactionId: id,
        status: status
      };
    }

    if (!recipientUser) {
      console.error('Recipient user not found');
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    // Send Telegram notification if user has Telegram chat ID
    if (recipientUser.telegram_chat_id) {
      try {
        console.log('Attempting to send Telegram notification to chat ID:', recipientUser.telegram_chat_id);
        await sendTelegramNotification(
          recipientUser.telegram_chat_id,
          type,
          itemData,
          amount,
          currency,
          transactionHash,
          senderAddress || payerWallet,
          chain
        );
        console.log('Telegram notification sent successfully');
        
        // Mark notification as sent in database to prevent duplicates
        if (transactionHash) {
          await supabase
            .from('payments')
            .update({ notification_sent: true })
            .eq('tx_hash', transactionHash);
        }
      } catch (telegramError) {
        console.error('Failed to send Telegram notification:', telegramError);
        console.error('Telegram error details:', {
          chatId: recipientUser.telegram_chat_id,
          type,
          amount,
          currency,
          error: telegramError.message
        });
        // Don't fail the entire webhook if Telegram fails
      }
    } else {
      console.log('No Telegram chat ID found for user, skipping Telegram notification');
    }

    // Send email notification
    await sendEmailNotification(
      recipientUser.email,
      recipientUser.name,
      type,
      itemData,
      amount,
      currency,
      transactionHash,
      senderAddress || payerWallet,
      chain
    );

    return res.status(200).json({ success: true, message: 'Notifications sent successfully' });
  } catch (error) {
    console.error('Error in payment notification webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendTelegramNotification(
  chatId: number,
  type: 'invoice' | 'payment_link' | 'proposal' | 'direct_transfer' | 'offramp',
  itemData: any,
  amount: number,
  currency: string,
  transactionHash?: string,
  senderWallet?: string,
  chain?: string
) {
  try {
    // Validate bot configuration
    if (!bot) {
      console.error('Telegram bot is not configured - TELEGRAM_BOT_TOKEN missing');
      throw new Error('Telegram bot not configured');
    }
    
    console.log('Sending Telegram notification:', {
      chatId,
      type,
      amount,
      currency,
      transactionHash,
      senderWallet,
      chain
    });
    let emoji, itemType, itemIdentifier, customTitle;
    
    if (type === 'invoice') {
      emoji = '📄';
      itemType = 'Invoice';
      itemIdentifier = itemData.number;
      customTitle = `📄 <b>Invoice Paid!</b>`;
    } else if (type === 'proposal') {
      emoji = '📋';
      itemType = 'Proposal';
      itemIdentifier = itemData.number || itemData.projectTitle;
      customTitle = `📋 <b>Proposal Paid!</b>`;
    } else if (type === 'direct_transfer') {
      emoji = '💸';
      itemType = 'Direct Transfer';
      itemIdentifier = 'Received';
      customTitle = `💸 <b>Direct Transfer Received!</b>`;
    } else if (type === 'offramp') {
      if (itemData.status === 'completed') {
        emoji = '🏦';
        itemType = 'Offramp';
        itemIdentifier = 'Completed';
        customTitle = `🏦 <b>Offramp Completed!</b>`;
      } else {
        emoji = '❌';
        itemType = 'Offramp';
        itemIdentifier = 'Failed';
        customTitle = `❌ <b>Offramp Failed!</b>`;
      }
    } else {
      emoji = '💰';
      itemType = 'Payment Link';
      itemIdentifier = itemData.title;
      customTitle = `💰 <b>Payment Link Paid!</b>`;
    }
    
    let message = `${customTitle}\n\n`;
    
    if (type === 'direct_transfer') {
      message += `💰 <b>Amount:</b> ${amount} ${currency}\n`;
      message += `👤 <b>From:</b> ${itemData.senderAddress}\n`;
      message += `📱 <b>To:</b> ${itemData.recipientWallet}\n`;
      message += `⛓️ <b>Chain:</b> ${itemData.chain}\n`;
    } else if (type === 'offramp') {
      message += `🆔 <b>Transaction ID:</b> ${itemData.transactionId}\n`;
      message += `💰 <b>Amount:</b> ${amount} ${currency}\n`;
      message += `📋 <b>Order ID:</b> ${itemData.orderId}\n`;
      if (itemData.liquidityProvider) {
        message += `🏢 <b>Provider:</b> ${itemData.liquidityProvider}\n`;
      }
      message += `📊 <b>Status:</b> ${itemData.status === 'completed' ? '✅ Completed' : '❌ Failed'}\n`;
    } else {
      if (type === 'invoice' || type === 'proposal') {
        // Add specific ID for tracking
        message += `🆔 <b>${itemType} ID:</b> ${itemData.id || 'N/A'}\n`;
        message += `${emoji} <b>${itemType}:</b> ${itemIdentifier}\n`;
        message += `💵 <b>Amount Paid:</b> ${amount} ${currency}\n`;
        message += `👤 <b>Client:</b> ${itemData.clientName || itemData.client_name || 'Unknown'}\n`;
        if (itemData.clientEmail || itemData.client_email) {
          message += `📧 <b>Client Email:</b> ${itemData.clientEmail || itemData.client_email}\n`;
        }
        message += `📝 <b>Project:</b> ${itemData.description || itemData.project_title || 'N/A'}\n`;
        if (itemData.freelancer_name) {
          message += `👨‍💼 <b>Freelancer:</b> ${itemData.freelancer_name}\n`;
        }
      } else if (type === 'payment_link') {
        // Show payment link ID as requested
        message += `🆔 <b>Payment Link ID:</b> ${itemData.id || 'N/A'}\n`;
        message += `💵 <b>Amount Paid:</b> ${amount} ${currency}\n`;
        
        // Show payer info - wallet address or email if available
        if (itemData.recipientEmail) {
          message += `👤 <b>Paid By:</b> ${itemData.recipientEmail}\n`;
        } else if (senderWallet) {
          message += `👤 <b>Paid By:</b> ${senderWallet.substring(0, 6)}...${senderWallet.substring(senderWallet.length - 4)}\n`;
        } else {
          message += `👤 <b>Paid By:</b> Unknown\n`;
        }
        
        // Show description
        message += `📝 <b>Description:</b> ${itemData.description || itemData.payment_reason || 'N/A'}\n`;
        
        // Show recipient (actual user's name)
        if (itemData.user_name) {
          message += `👨‍💼 <b>Recipient:</b> ${itemData.user_name}\n`;
        }
      }
      
      if (senderWallet) {
        message += `🔗 <b>Payer Wallet:</b> ${senderWallet.substring(0, 6)}...${senderWallet.substring(senderWallet.length - 4)}\n`;
      }
      
      if (chain) {
        message += `⛓️ <b>Network:</b> ${chain.charAt(0).toUpperCase() + chain.slice(1)}\n`;
      }
    }
    
    if (transactionHash) {
      message += `🧾 <b>Transaction Hash:</b> \n<code>${transactionHash}</code>\n`;
    }
    
    message += `\n✅ <b>Status:</b> Payment Confirmed & Processed\n`;
    message += `⏰ <b>Confirmed At:</b> ${new Date().toLocaleString()}\n`;
    
    // Add success footer based on payment type
    if (type === 'invoice') {
      message += `\n🎉 Your invoice has been successfully paid!`;
    } else if (type === 'payment_link') {
      message += `\n🎉 Your payment link has been successfully paid!`;
    } else if (type === 'proposal') {
      message += `\n🎉 Your proposal has been accepted and paid!`;
    } else if (type === 'offramp') {
      if (itemData.status === 'completed') {
        message += `\n🎉 Your crypto has been successfully converted to fiat!`;
      } else {
        message += `\n😞 Your offramp transaction failed. Please try again or contact support.`;
      }
    } else {
      message += `\n💰 Direct payment received in your wallet!`;
    }

    let keyboard;
    if (transactionHash) {
      // Determine explorer URL based on currency and chain
      let explorerUrl = '';
      let explorerName = '';
      let addressUrl = '';
      
      if (chain === 'base-mainnet' || chain === 'BASE_MAINNET') {
        explorerUrl = `https://basescan.org/tx/${transactionHash}`;
        explorerName = 'BaseScan';
        if (type === 'direct_transfer') {
          addressUrl = `https://basescan.org/address/${itemData.recipientWallet}`;
        }
      } else if (chain === 'base' || chain === 'BASE') {
        explorerUrl = `https://basescan.org/tx/${transactionHash}`;
        explorerName = 'BaseScan';
        if (type === 'direct_transfer') {
          addressUrl = `https://basescan.org/address/${itemData.recipientWallet}`;
        }
      } else if (chain === 'ethereum-mainnet' || chain === 'ETHEREUM_MAINNET') {
        explorerUrl = `https://etherscan.io/tx/${transactionHash}`;
        explorerName = 'Etherscan';
        if (type === 'direct_transfer') {
          addressUrl = `https://etherscan.io/address/${itemData.recipientWallet}`;
        }
      } else if (chain === 'solana-mainnet' || chain === 'SOLANA_MAINNET' || chain === 'solana') {
        explorerUrl = `https://solscan.io/tx/${transactionHash}`;
        explorerName = 'Solscan';
        if (type === 'direct_transfer') {
          addressUrl = `https://solscan.io/account/${itemData.recipientWallet}`;
        }
      } else {
        // Default to BaseScan for unknown chains
        explorerUrl = `https://basescan.org/tx/${transactionHash}`;
        explorerName = 'BaseScan';
        if (type === 'direct_transfer') {
          addressUrl = `https://basescan.org/address/${itemData.recipientWallet}`;
        }
      }
      
      if (type === 'direct_transfer' && addressUrl) {
        keyboard = {
          inline_keyboard: [
            [{
              text: `🔍 View on ${explorerName}`,
              url: explorerUrl
            }],
            [{
              text: '💰 Check Balance',
              callback_data: `check_balance_${itemData.recipientWallet}`
            }]
          ]
        };
      } else {
        keyboard = {
          inline_keyboard: [
            [{
              text: `🔍 View on ${explorerName}`,
              url: explorerUrl
            }],
            [
              { text: '📊 View Earnings', callback_data: 'earnings_summary' },
              { text: '💼 Dashboard', callback_data: 'business_dashboard' }
            ]
          ]
        };
      }
    } else {
      keyboard = {
        inline_keyboard: [
          [
            { text: '📊 View Earnings', callback_data: 'earnings_summary' },
            { text: '💼 Dashboard', callback_data: 'business_dashboard' }
          ]
        ]
      };
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    
    console.log(`✅ Telegram notification sent successfully to chat ID: ${chatId}`);
    
    // Mark notification as sent in database to prevent duplicates
    if (transactionHash) {
      await supabase
        .from('payments')
        .update({ notification_sent: true })
        .eq('tx_hash', transactionHash);
    }
  } catch (error: any) {
    console.error(`❌ Failed to send Telegram notification to chat ID ${chatId}:`, {
      error: error.message,
      code: error.code,
      response: error.response?.body
    });
    
    // Handle specific Telegram API errors
    if (error.code === 'ETELEGRAM') {
      const telegramError = error.response?.body;
      if (telegramError?.error_code === 400 && telegramError?.description?.includes('chat not found')) {
        console.error(`🚫 Chat not found for chat ID ${chatId}. User may need to start a conversation with the bot first.`);
        
        // Update user record to mark Telegram as inactive
        try {
          await supabase
            .from('users')
            .update({ telegram_active: false })
            .eq('telegram_chat_id', chatId);
          console.log(`📝 Marked Telegram as inactive for chat ID ${chatId}`);
        } catch (updateError) {
          console.error('Error updating user telegram_active status:', updateError);
        }
      } else if (telegramError?.error_code === 403) {
        console.error(`🚫 Bot was blocked by user with chat ID ${chatId}`);
      } else {
        console.error(`🚫 Telegram API error for chat ID ${chatId}:`, telegramError);
      }
    }
    
    // Re-throw the error so the caller knows the notification failed
    throw error;
  }
}

async function sendEmailNotification(
  email: string,
  name: string,
  type: 'invoice' | 'payment_link' | 'proposal' | 'direct_transfer' | 'offramp',
  itemData: any,
  amount: number,
  currency: string,
  transactionHash?: string,
  senderWallet?: string,
  chain?: string
) {
  try {
    // Import email service
    const { sendEmail } = await import('../../../lib/emailService');
    
    let itemType, itemIdentifier;
    
    if (type === 'invoice') {
      itemType = 'Invoice';
      itemIdentifier = itemData.number;
    } else if (type === 'proposal') {
      itemType = 'Proposal';
      itemIdentifier = itemData.number || itemData.projectTitle;
    } else if (type === 'direct_transfer') {
      itemType = 'Direct Transfer';
      itemIdentifier = 'Received';
    } else if (type === 'offramp') {
      itemType = 'Offramp Transaction';
      itemIdentifier = itemData.status === 'completed' ? 'Completed' : 'Failed';
    } else {
      itemType = 'Payment Link';
      itemIdentifier = itemData.title;
    }
    
    const subject = type === 'offramp' && itemData.status === 'failed' 
      ? `❌ Offramp Failed - ${itemType} ${itemIdentifier}`
      : `🎉 ${type === 'offramp' ? 'Offramp Completed' : 'Payment Received'} - ${itemType} ${itemIdentifier}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, ${type === 'offramp' && itemData.status === 'failed' ? '#dc3545 0%, #c82333 100%' : '#667eea 0%, #764ba2 100%'}); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">${type === 'offramp' && itemData.status === 'failed' ? '❌ Offramp Failed!' : type === 'offramp' ? '🏦 Offramp Completed!' : '🎉 Payment Received!'}</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <p style="font-size: 18px; margin-bottom: 20px;">Hi ${name},</p>
          
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
            ${type === 'offramp' && itemData.status === 'failed' 
              ? 'We\'re sorry, but your offramp transaction has failed.' 
              : type === 'offramp' 
                ? 'Great news! Your crypto has been successfully converted to fiat currency.' 
                : `Great news! You've received a payment for your ${itemType.toLowerCase()}.`}
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid ${type === 'offramp' && itemData.status === 'failed' ? '#dc3545' : '#28a745'}; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #333;">${type === 'offramp' ? 'Offramp Details' : 'Payment Details'}</h3>
            <p style="margin: 5px 0;"><strong>${itemType}:</strong> ${itemIdentifier}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount} ${currency}</p>
            ${type === 'offramp' ? `
              <p style="margin: 5px 0;"><strong>Order ID:</strong> ${itemData.orderId}</p>
              ${itemData.liquidityProvider ? `<p style="margin: 5px 0;"><strong>Provider:</strong> ${itemData.liquidityProvider}</p>` : ''}
            ` : type === 'invoice' || type === 'proposal' ? `
              <p style="margin: 5px 0;"><strong>Client:</strong> ${itemData.clientName}</p>
              <p style="margin: 5px 0;"><strong>Project:</strong> ${itemData.description}</p>
            ` : `
              <p style="margin: 5px 0;"><strong>Description:</strong> ${itemData.description}</p>
            `}
            ${senderWallet ? `<p style="margin: 5px 0;"><strong>Sender Wallet:</strong> <code style="background: #f1f3f4; padding: 2px 4px; border-radius: 3px;">${senderWallet}</code></p>` : ''}
            ${chain ? `<p style="margin: 5px 0;"><strong>Chain:</strong> ${chain}</p>` : ''}
            ${transactionHash ? `<p style="margin: 5px 0;"><strong>Transaction Hash:</strong> <code style="background: #f1f3f4; padding: 2px 4px; border-radius: 3px;">${transactionHash}</code></p>` : ''}
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${type === 'offramp' && itemData.status === 'failed' ? '#dc3545' : '#28a745'}; font-weight: bold;">${type === 'offramp' && itemData.status === 'failed' ? '❌ Failed' : '✅ Confirmed'}</span></p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" 
               style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              View Dashboard
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6c757d; margin-top: 30px; text-align: center;">
            This is an automated notification from Hedwig Bot. The payment has been confirmed on the blockchain.
          </p>
        </div>
      </div>
    `;
    
    await sendEmail({
      to: email,
      subject,
      html
    });
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
}