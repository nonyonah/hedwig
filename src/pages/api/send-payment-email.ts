import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EmailData {
  recipientEmail: string;
  paymentLink: string;
  amount: number;
  token: string;
  network: string;
  userName: string;
  paymentReason: string;
}

async function sendPaymentLinkEmail(emailData: EmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('Resend API key not configured, skipping email');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Hedwig <payments@hedwig.xyz>',
        to: [emailData.recipientEmail],
        subject: `Payment Request: ${emailData.amount} ${emailData.token}`,
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
                    <div class="amount-value">${emailData.amount} ${emailData.token}</div>
                    <div class="amount-network">on ${emailData.network.charAt(0).toUpperCase() + emailData.network.slice(1)}</div>
                  </div>
                  
                  <div class="details">
                    <div class="detail-row">
                      <span class="detail-label">From</span>
                      <span class="detail-value">${emailData.userName}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">For</span>
                      <span class="detail-value">${emailData.paymentReason}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Network</span>
                      <span class="detail-value">${emailData.network.charAt(0).toUpperCase() + emailData.network.slice(1)}</span>
                    </div>
                  </div>
                  
                  <div class="security-note">
                    <p><strong>Security Notice:</strong> Always verify the payment details and recipient address before completing any transaction. This link will expire in 24 hours.</p>
                  </div>
                  
                  <div class="cta">
                    <a href="${emailData.paymentLink}" class="cta-button">Complete Payment</a>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 0;">
                    If you're unable to click the button above, copy and paste this link into your browser:<br>
                    <span style="word-break: break-all; color: #4f46e5;">${emailData.paymentLink}</span>
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'Payment ID is required' });
    }

    // Get payment data
    const { data: paymentData, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (error || !paymentData) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (!paymentData.recipient_email) {
      return res.status(400).json({ error: 'No recipient email provided' });
    }

    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${paymentId}`;

    await sendPaymentLinkEmail({
      recipientEmail: paymentData.recipient_email,
      paymentLink,
      amount: paymentData.amount,
      token: paymentData.token,
      network: paymentData.network,
      userName: paymentData.user_name,
      paymentReason: paymentData.payment_reason,
    });

    return res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error in send-payment-email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}