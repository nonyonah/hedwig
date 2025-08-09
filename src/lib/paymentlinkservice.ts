import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';
import { Resend } from 'resend';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const supportedTokens = ['USDC']; // Only USDC stablecoin is supported
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

    // Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        await sendPaymentLinkEmail({
          recipientEmail,
          amount,
          token,
          network,
          paymentLink,
          senderName: userName,
          reason: paymentReason
        });
        console.log(`Payment link email sent to ${recipientEmail}`);
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

interface SendPaymentLinkEmailParams {
  recipientEmail: string;
  amount: number;
  token: string;
  network: string;
  paymentLink: string;
  senderName: string;
  reason: string;
}

export async function sendPaymentLinkEmail(params: SendPaymentLinkEmailParams): Promise<void> {
  const { recipientEmail, amount, token, network, paymentLink, senderName, reason } = params;

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  // Get user data for personalized sender email
  const { data: userData } = await supabase
    .from('users')
    .select('email, name')
    .eq('name', senderName)
    .single();

  const senderEmail = userData?.email || 'noreply@hedwigbot.xyz';
  const displayName = userData?.name || senderName;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Request</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .payment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
        .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .security-notice { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>💰 Payment Request</h1>
        <p>You have received a payment request</p>
      </div>
      
      <div class="content">
        <div class="payment-details">
          <h3>Payment Details</h3>
          <p><strong>From:</strong> ${displayName} (${senderEmail})</p>
          <p><strong>For:</strong> ${reason}</p>
          <p><strong>Network:</strong> ${network.toUpperCase()}</p>
          <p><strong>Amount:</strong> ${amount} ${token.toUpperCase()}</p>
        </div>
        
        <div class="security-notice">
          <p><strong>🔒 Security Notice:</strong> Always verify payment details before proceeding. This link is secure and encrypted.</p>
        </div>
        
        <div style="text-align: center;">
          <a href="${paymentLink}" class="button">Complete Payment</a>
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">${paymentLink}</p>
      </div>
      
      <div class="footer">
        <p>This payment request was sent via Hedwig Bot</p>
        <p>If you didn't expect this payment request, please ignore this email.</p>
      </div>
    </body>
    </html>
  `;

  const result = await resend.emails.send({
    from: `${displayName} <${senderEmail}>`,
    to: recipientEmail,
    subject: `Payment Request: ${amount} ${token.toUpperCase()} for ${reason}`,
    html: emailHtml
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }
}