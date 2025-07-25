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
  walletAddress?: string;
}

async function sendPaymentLinkEmail(emailData: EmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('Resend API key not configured, skipping email');
    return;
  }

  try {
    // Get the user's name from the database using wallet address
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('wallet_address', emailData.walletAddress?.toLowerCase())
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
        to: [emailData.recipientEmail],
        subject: `Payment Request: ${emailData.amount} ${emailData.token}`,
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Request</title>
            <!--[if mso]>
            <noscript>
              <xml>
                <o:OfficeDocumentSettings>
                  <o:PixelsPerInch>96</o:PixelsPerInch>
                </o:OfficeDocumentSettings>
              </xml>
            </noscript>
            <![endif]-->
          </head>
          <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
             <!-- Main Container -->
             <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb;">
              <tr>
                <td style="padding: 32px 20px;">
                  <!-- Content Container -->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 448px; margin: 0 auto;">
                    <!-- Header -->
                    <tr>
                      <td style="padding-bottom: 64px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>
                            <td style="text-align: left;">
                              <h1 style="margin: 0; font-size: 18px; font-weight: 500; color: #262624;">hedwig.</h1>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Payment Card -->
                    <tr>
                      <td>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                          <!-- Card Header -->
                          <tr>
                            <td style="padding: 24px 24px 32px 24px; text-align: center;">
                              <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #262624;">Payment Request</h2>
                            </td>
                          </tr>
                          
                          <!-- Card Content -->
                          <tr>
                            <td style="padding: 0 24px 24px 24px;">
                              <!-- Payment Details -->
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <!-- From Row -->
                                <tr>
                                  <td style="padding-bottom: 16px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                      <tr>
                                        <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">From</td>
                                        <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${emailData.userName}</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- For Row -->
                                <tr>
                                  <td style="padding-bottom: 16px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                      <tr>
                                        <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">For</td>
                                        <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${emailData.paymentReason}</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Network Row -->
                                <tr>
                                  <td style="padding-bottom: 16px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                      <tr>
                                        <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">Network</td>
                                        <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${emailData.network.charAt(0).toUpperCase() + emailData.network.slice(1)}</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Amount Row -->
                                <tr>
                                  <td style="padding-bottom: 24px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                      <tr>
                                        <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">Amount</td>
                                        <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${emailData.amount} ${emailData.token}</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Security Notice -->
                                <tr>
                                  <td style="padding-bottom: 24px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-radius: 6px; padding: 12px;">
                                      <tr>
                                        <td style="color: #92400e; font-size: 12px; text-align: center;">
                                          <strong>Security Notice:</strong> Always verify payment details before completing any transaction. This link expires in 24 hours.
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Pay Button -->
                                <tr>
                                  <td style="text-align: center; padding-top: 16px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                      <tr>
                                        <td style="background-color: #7f56d9; border-radius: 6px;">
                                          <a href="${emailData.paymentLink}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; line-height: 1.2; white-space: nowrap;">Complete Payment</a>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Fallback Link -->
                                <tr>
                                  <td style="padding-top: 16px; text-align: center;">
                                    <p style="margin: 0; color: #6b7280; font-size: 12px;">
                                      If you're unable to click the button, copy this link:<br>
                                      <span style="word-break: break-all; color: #7f56d9; font-size: 11px;">${emailData.paymentLink}</span>
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
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

    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/pay/${paymentId}`;

    await sendPaymentLinkEmail({
      recipientEmail: paymentData.recipient_email,
      paymentLink,
      amount: paymentData.amount,
      token: paymentData.token,
      network: paymentData.network,
      userName: paymentData.user_name,
      paymentReason: paymentData.payment_reason,
      walletAddress: paymentData.wallet_address,
    });

    return res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error in send-payment-email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}