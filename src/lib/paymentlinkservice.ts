import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CreatePaymentLinkParams {
  amount: number;
  token: string;
  network: string;
  walletAddress: string;
  userName: string;
  paymentReason: string;
  recipientEmail?: string;
}

export interface CreatePaymentLinkResult {
  success: boolean;
  paymentLink?: string;
  id?: string;
  error?: string;
}

export async function createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult> {
  const {
    amount,
    token,
    network,
    walletAddress,
    userName,
    paymentReason,
    recipientEmail
  } = params;

  try {
    // Validate required fields
    if (!amount || !token || !network || !walletAddress || !userName || !paymentReason) {
      return {
        success: false,
        error: 'Missing required fields: amount, token, network, walletAddress, userName, paymentReason'
      };
    }

    // Validate amount is positive
    if (amount <= 0) {
      return {
        success: false,
        error: 'Amount must be greater than 0'
      };
    }

    // Validate wallet address format (basic Ethereum address validation)
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return {
        success: false,
        error: 'Invalid wallet address format'
      };
    }

    // Validate email format if provided
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return {
        success: false,
        error: 'Invalid email format'
      };
    }

    // Validate network
    const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism-sepolia', 'celo-alfajores'];
    
    if (!supportedNetworks.includes(network.toLowerCase())) {
      return {
        success: false,
        error: `Unsupported network. Supported networks: ${supportedNetworks.join(', ')}`
      };
    }

    // Validate token
    const supportedTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'MATIC', 'ARB', 'OP'];
    if (!supportedTokens.includes(token.toUpperCase())) {
      return {
        success: false,
        error: `Unsupported token. Supported tokens: ${supportedTokens.join(', ')}`
      };
    }

    // Insert payment link into database
    const { data, error } = await supabase
      .from('payment_links')
      .insert({
        amount,
        token: token.toUpperCase(),
        network: network.toLowerCase(),
        wallet_address: walletAddress.toLowerCase(),
        user_name: userName,
        payment_reason: paymentReason,
        recipient_email: recipientEmail || null,
        status: 'pending'
      })
      .select('id')
      .single();

    if (error) {
      console.error('Database error:', error);
      return {
        success: false,
        error: 'Failed to create payment link'
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const paymentLink = `${baseUrl}/payment-link/${data.id}`;

    // TODO: Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        // Email sending logic would go here
        console.log(`Email would be sent to ${recipientEmail} for payment link ${paymentLink}`);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the request if email fails, just log it
      }
    }

    return {
      success: true,
      paymentLink,
      id: data.id
    };

  } catch (error) {
    console.error('Payment link creation error:', error);
    return {
      success: false,
      error: 'Internal server error'
    };
  }
}