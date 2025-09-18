import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';
import { Resend } from 'resend';
import { trackEvent } from './posthog';
import { generatePaymentLinkEmailTemplate } from './emailService';

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
  userId: string; // Add userId to associate with the creator
  dueDate?: string; // ISO date string for payment due date
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
    recipientEmail,
    userId, // Destructure userId
    dueDate
  } = params;

  try {
    // Validate required fields
    if (!amount || !token || !network || !walletAddress || !userName || !paymentReason || !userId) {
      return {
        success: false,
        error: 'Missing required fields: amount, token, network, walletAddress, userName, paymentReason, userId'
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
    const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism', 'celo-sepolia', 'lisk-sepolia'];
    
    if (!supportedNetworks.includes(network.toLowerCase())) {
      return {
        success: false,
        error: `Unsupported network. Supported networks: ${supportedNetworks.join(', ')}`
      };
    }

    // Validate token
    const supportedTokens = ['USDC', 'USDT', 'LISK', 'CELO', 'cUSD']; // Multiple tokens now supported
    if (!supportedTokens.includes(token.toUpperCase())) {
      return {
        success: false,
        error: `Unsupported token. Supported tokens: ${supportedTokens.join(', ')}`
      };
    }

    // Validate due date format if provided
    if (dueDate) {
      const dueDateObj = new Date(dueDate);
      if (isNaN(dueDateObj.getTime())) {
        return {
          success: false,
          error: 'Invalid due date format. Please use ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)'
        };
      }
      // Check if due date is in the past
      if (dueDateObj < new Date()) {
        return {
          success: false,
          error: 'Due date cannot be in the past'
        };
      }
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
        created_by: userId, // Add the user ID
        recipient_email: recipientEmail || null,
        status: 'pending',
        due_date: dueDate ? new Date(dueDate).toISOString() : null
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

    // Build a robust base URL that works in Vercel, other prod, and local dev
    const vercelUrl = process.env.VERCEL_URL;
    let resolvedBaseUrl;
    
    if (process.env.NEXT_PUBLIC_APP_URL) {
      resolvedBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
    } else if (process.env.NEXT_PUBLIC_BASE_URL) {
      resolvedBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    } else if (vercelUrl) {
      resolvedBaseUrl = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
    } else {
      resolvedBaseUrl = 'https://hedwigbot.xyz';
    }
    
    const paymentLink = `${resolvedBaseUrl}/payment-link/${data.id}`;
    console.log('Payment link generated:', paymentLink);

    // Track payment_link_created event
    try {
      const { HedwigEvents } = await import('./posthog');
      await HedwigEvents.paymentLinkCreated(userId, {
        amount: amount,
        token: token.toUpperCase(),
        network: network.toLowerCase(),
        payment_reason: paymentReason,
        recipient_email: recipientEmail || null,
        payment_link_id: data.id,
        wallet_address: walletAddress.toLowerCase()
      });
      console.log('✅ Payment link created event tracked successfully');
    } catch (trackingError) {
      console.error('Error tracking payment_link_created event:', trackingError);
    }

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

export interface SendPaymentLinkEmailParams {
  recipientEmail: string;
  amount: number;
  token: string;
  network: string;
  paymentLink: string;
  senderName: string;
  reason: string;
  customMessage?: string;
  isReminder?: boolean;
}

export async function sendPaymentLinkEmail(params: SendPaymentLinkEmailParams): Promise<void> {
  const { recipientEmail, amount, token, network, paymentLink, senderName, reason, isReminder } = params;

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  // Get user data for personalized display name
  const { data: userData } = await supabase
    .from('users')
    .select('email, name')
    .eq('name', senderName)
    .single();

  // Always use verified domain for 'from' address to avoid domain verification issues
  const senderEmail = process.env.EMAIL_FROM || 'noreply@hedwigbot.xyz';
  const displayName = userData?.name || senderName;
  const userEmail = userData?.email; // Keep user email for display purposes

  const emailHtml = generatePaymentLinkEmailTemplate({
     sender_name: displayName,
     amount,
     token,
     reason,
     custom_message: params.customMessage,
     payment_link: paymentLink
   });

  const subject = isReminder 
    ? `Payment Reminder: ${amount} ${token.toUpperCase()} for ${reason}`
    : `Payment Request: ${amount} ${token.toUpperCase()} for ${reason}`;

  const result = await resend.emails.send({
    from: `${displayName} <${senderEmail}>`,
    to: recipientEmail,
    subject,
    html: emailHtml
  });

  if (result.error) {
    const errorMessage = result.error.message || JSON.stringify(result.error) || 'Unknown email error';
    throw new Error(`Failed to send email: ${errorMessage}`);
  }
}