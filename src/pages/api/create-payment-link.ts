import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from '@/lib/serverEnv';
import { sendEmail, generatePaymentLinkEmailTemplate } from '../../lib/emailService';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function to get chain info from network
function getChainInfo(network: string): { blockchain: string; chain_id: number } {
  const normalizedNetwork = network.toLowerCase();
  
  switch (normalizedNetwork) {
    case 'celo':
    case 'celo-mainnet':
      return { blockchain: 'celo', chain_id: 42220 };
    case 'celo-sepolia':
    case 'celo-testnet':
      return { blockchain: 'celo', chain_id: 44787 };
    case 'base':
    case 'base-mainnet':
      return { blockchain: 'base', chain_id: 8453 };
    case 'base-sepolia':
    case 'base-testnet':
      return { blockchain: 'base', chain_id: 84532 };
    case 'polygon':
    case 'polygon-mainnet':
      return { blockchain: 'polygon', chain_id: 137 };
    case 'polygon-mumbai':
    case 'polygon-testnet':
      return { blockchain: 'polygon', chain_id: 80001 };
    case 'lisk-sepolia':
      return { blockchain: 'lisk', chain_id: 4202 };
    default:
      // Default to Base for unknown networks
      return { blockchain: 'base', chain_id: 8453 };
  }
}

interface CreatePaymentLinkRequest {
  amount: number;
  token: string;
  network: string;
  walletAddress: string;
  userName: string;
  for: string;
  recipientEmail?: string;
  proposalId?: string;
  invoiceId?: string;
  dueDate?: string; // ISO date string for payment due date
}

interface CreatePaymentLinkResponse {
  success: boolean;
  paymentLink?: string;
  id?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatePaymentLinkResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const {
      amount,
      token,
      network,
      walletAddress,
      userName,
      for: paymentReason,
      recipientEmail,
      proposalId,
      invoiceId,
      dueDate
    }: CreatePaymentLinkRequest = req.body;

    // Validate required fields
    if (!amount || !token || !network || !walletAddress || !userName || !paymentReason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount, token, network, walletAddress, userName, for'
      });
    }

    // Validate amount is positive
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Validate wallet address format (basic Ethereum address validation)
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      });
    }

    // Validate email format if provided
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate network
    const supportedNetworks = ['base', 'polygon', 'celo', 'celo-sepolia', 'lisk-sepolia'];
    // DISABLED NETWORKS: BEP20 and Asset Chain are not yet active
    // const disabledNetworks = ['bsc', 'bsc-testnet', 'asset-chain', 'asset-chain-testnet'];
    
    if (!supportedNetworks.includes(network.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Unsupported network. Supported networks: ${supportedNetworks.join(', ')}`
      });
    }

    // Validate token
    const supportedTokens = ['USDC', 'USDT', 'LISK', 'CELO', 'cUSD', 'cUSDC']; // Multiple tokens now supported
    
    // Normalize token names (cUSDC is an alias for cUSD)
    let normalizedToken = token.toUpperCase();
    if (normalizedToken === 'CUSDC') {
      normalizedToken = 'CUSD';
    }
    
    if (!supportedTokens.includes(normalizedToken)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported token. Supported tokens: ${supportedTokens.join(', ')}`
      });
    }

    // Validate that only one of proposalId or invoiceId is provided
    if (proposalId && invoiceId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot link payment to both proposal and invoice. Choose one.'
      });
    }

    // Validate due date format if provided
    if (dueDate) {
      const dueDateObj = new Date(dueDate);
      if (isNaN(dueDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid due date format. Please use ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)'
        });
      }
      // Check if due date is in the past
      if (dueDateObj < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Due date cannot be in the past'
        });
      }
    }

    // Get chain info for proper contract selection
    const chainInfo = getChainInfo(network);

    // Insert payment link into database
    const insertData: any = {
      amount,
      token: normalizedToken,
      network: network.toLowerCase(),
      blockchain: chainInfo.blockchain,
      chain_id: chainInfo.chain_id,
      wallet_address: walletAddress.toLowerCase(),
      user_name: userName,
      payment_reason: paymentReason,
      recipient_email: recipientEmail || null,
      status: 'pending',
      due_date: dueDate ? new Date(dueDate).toISOString() : null
    };

    // Add proposal_id or invoice_id if provided
    if (proposalId) {
      insertData.proposal_id = proposalId;
    }
    if (invoiceId) {
      insertData.invoice_id = invoiceId;
    }

    const { data, error } = await supabase
      .from('payment_links')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment link'
      });
    }

    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/payment-link/${data.id}`;

    // Award referral points for first payment link creation
    try {
      const { awardActionPoints } = await import('../../lib/referralService');
      // Get user ID from wallet address or userName (you may need to adjust this based on your user identification)
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();
      
      if (userData?.id) {
        await awardActionPoints(userData.id, 'first_payment_link');
      }
    } catch (referralError) {
      console.error('Error awarding referral points for payment link:', referralError);
      // Don't fail the request if referral points fail
    }

    // Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        // Get the user's name from the database using wallet address
        const { data: userData } = await supabase
          .from('users')
          .select('name')
          .eq('wallet_address', walletAddress.toLowerCase())
          .single();

        const emailHtml = generatePaymentLinkEmailTemplate({
           sender_name: userData?.name || userName,
           amount,
           token,
           reason: paymentReason,
           payment_link: paymentLink
         });

         await sendEmail({
           to: recipientEmail,
           subject: `Payment Request: ${amount} ${token}`,
           html: emailHtml
         });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the request if email fails, just log it
      }
    }

    return res.status(201).json({
      success: true,
      paymentLink,
      id: data.id
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}