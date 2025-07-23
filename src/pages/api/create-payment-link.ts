import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CreatePaymentLinkRequest {
  amount: number;
  token: string;
  network: string;
  walletAddress: string;
  userName: string;
  for: string;
  recipientEmail?: string;
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
      recipientEmail
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
    const supportedNetworks = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism'];
    if (!supportedNetworks.includes(network.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Unsupported network. Supported networks: ${supportedNetworks.join(', ')}`
      });
    }

    // Validate token
    const supportedTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'MATIC', 'ARB', 'OP'];
    if (!supportedTokens.includes(token.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Unsupported token. Supported tokens: ${supportedTokens.join(', ')}`
      });
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
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment link'
      });
    }

    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/pay/${data.id}`;

    // TODO: Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        await sendPaymentLinkEmail({
          recipientEmail,
          paymentLink,
          amount,
          token,
          userName,
          paymentReason,
          network,
          walletAddress
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

// Email sending function using Resend
async function sendPaymentLinkEmail({
  recipientEmail,
  paymentLink,
  amount,
  token,
  userName,
  paymentReason,
  network,
  walletAddress
}: {
  recipientEmail: string;
  paymentLink: string;
  amount: number;
  token: string;
  userName: string;
  paymentReason: string;
  network: string;
  walletAddress: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('Resend API key not configured, skipping email');
    return;
  }

  try {
    // Get the user's name from the database using wallet address
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    // Create personalized email address
    const userEmail = userData?.name 
      ? `${userData.name.toLowerCase().replace(/\s+/g, '')}@hedwigbot.xyz`
      : 'payments@hedwigbot.xyz';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: userData?.name ? `${userData.name} <${userEmail}>` : 'Hedwig <payments@hedwigbot.xyz>',
        to: [recipientEmail],
        subject: `Payment Request: ${amount} ${token}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Payment Request</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
                .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px; }
                .content { padding: 40px 20px; }
                .amount { text-align: center; margin-bottom: 32px; }
                .amount-value { font-size: 36px; font-weight: 700; color: #111827; margin-bottom: 4px; }
                .amount-network { color: #6b7280; font-size: 14px; }
                .details { background-color: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 32px; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
                .detail-row:last-child { margin-bottom: 0; }
                .detail-label { color: #6b7280; font-size: 14px; }
                .detail-value { color: #111827; font-size: 14px; font-weight: 500; }
                .cta { text-align: center; margin-bottom: 32px; }
                .cta-button { display: inline-block; background-color: #4f46e5; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; }
                .cta-button:hover { background-color: #4338ca; }
                .footer { text-align: center; color: #6b7280; font-size: 12px; padding: 20px; border-top: 1px solid #e5e7eb; }
                .security-note { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
                .security-note p { margin: 0; color: #92400e; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Payment Request</h1>
                  <p>You have received a crypto payment request</p>
                </div>
                
                <div class="content">
                  <div class="amount">
                    <div class="amount-value">${amount} ${token}</div>
                    <div class="amount-network">on ${network.charAt(0).toUpperCase() + network.slice(1)}</div>
                  </div>
                  
                  <div class="details">
                    <div class="detail-row">
                      <span class="detail-label">From</span>
                      <span class="detail-value">${userName}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">For</span>
                      <span class="detail-value">${paymentReason}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Network</span>
                      <span class="detail-value">${network.charAt(0).toUpperCase() + network.slice(1)}</span>
                    </div>
                  </div>
                  
                  <div class="security-note">
                    <p><strong>Security Notice:</strong> Always verify the payment details and recipient address before completing any transaction. This link will expire in 24 hours.</p>
                  </div>
                  
                  <div class="cta">
                    <a href="${paymentLink}" class="cta-button">Complete Payment</a>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 0;">
                    If you're unable to click the button above, copy and paste this link into your browser:<br>
                    <span style="word-break: break-all; color: #4f46e5;">${paymentLink}</span>
                  </p>
                </div>
                
                <div class="footer">
                  <p>Powered by Hedwig • Secure crypto payments</p>
                  <p>This email was sent because a payment request was created with your email address.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Failed to send email:', errorData);
      throw new Error(`Email API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Email sent successfully:', result.id);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}