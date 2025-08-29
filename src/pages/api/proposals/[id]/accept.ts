import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { createInvoice } from '@/lib/invoiceService';
import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: false });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid proposal ID' });
    }

    // Fetch proposal data
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', id)
      .single();

    if (proposalError || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check if proposal is already accepted
    if (proposal.status === 'accepted') {
      return res.status(400).json({ error: 'Proposal already accepted' });
    }

    // Get freelancer data
    const { data: freelancer, error: freelancerError } = await supabase
      .from('users')
      .select('*')
      .eq('id', proposal.user_id)
      .single();

    if (freelancerError || !freelancer) {
      return res.status(404).json({ error: 'Freelancer not found' });
    }

    // Get freelancer's wallet address from wallets table
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', proposal.user_id);

    let freelancerWalletAddress = '0x0000000000000000000000000000000000000000';
    if (wallets && wallets.length > 0) {
      // Prefer Base/EVM wallet, fallback to any wallet
      const baseWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'base' || (w.chain || '').toLowerCase() === 'evm');
      freelancerWalletAddress = baseWallet?.address || wallets[0]?.address || freelancerWalletAddress;
    }

    // Auto-generate invoice from proposal data using the existing invoice service
    const invoiceParams = {
      amount: proposal.amount || proposal.budget || 0,
      token: 'USDC', // Default to USDC for crypto payments
      network: 'base', // Default to Base network
      walletAddress: freelancerWalletAddress, // Use freelancer's wallet from wallets table
      userName: proposal.freelancer_name || freelancer.name || 'Freelancer', // Use freelancer name as recipient
      description: proposal.project_description || proposal.description || 'Project work',
      recipientEmail: proposal.client_email,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      userId: proposal.user_id
    };

    // Create the invoice using the existing invoice service
    const invoiceResult = await createInvoice(invoiceParams);

    if (!invoiceResult.success) {
      console.error('Error creating invoice:', invoiceResult.error);
      return res.status(500).json({ error: invoiceResult.error || 'Failed to create invoice' });
    }

    // Update proposal status to accepted
    const { error: updateError } = await supabase
      .from('proposals')
      .update({ 
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        invoice_id: invoiceResult.id
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating proposal:', updateError);
      return res.status(500).json({ error: 'Failed to update proposal status' });
    }

    // Notify freelancer via Telegram
    if (freelancer.telegram_chat_id) {
      try {
        const message = `🎉 Great news! Your proposal has been accepted!\n\n` +
          `📋 **Project:** ${proposal.project_description || proposal.description}\n` +
          `👤 **Client:** ${proposal.client_name}\n` +
          `💰 **Amount:** ${proposal.currency || 'USD'} ${(proposal.amount || proposal.budget)?.toLocaleString()}\n\n` +
          `📄 An invoice has been automatically generated and sent to your client.\n` +
          `Invoice ID: ${invoiceResult.id}\n\n` +
          `You'll receive another notification once the payment is completed.`;

        await bot.sendMessage(freelancer.telegram_chat_id, message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '📊 View Dashboard', callback_data: 'business_dashboard' },
              { text: '📄 View Invoice', callback_data: `view_invoice_${invoiceResult.id}` }
            ]]
          }
        });
      } catch (telegramError) {
        console.error('Error sending Telegram notification:', telegramError);
        // Don't fail the request if Telegram notification fails
      }
    }

    // For GET requests (from email links), redirect directly to the invoice
    if (req.method === 'GET') {
      return res.redirect(302, invoiceResult.invoiceLink!);
    }

    // For POST requests (API calls), return JSON response
    res.status(200).json({
      success: true,
      message: 'Proposal accepted and invoice generated successfully',
      invoice_id: invoiceResult.id,
      payment_url: invoiceResult.invoiceLink
    });

  } catch (error) {
    console.error('Error accepting proposal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}