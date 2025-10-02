import { Resend } from 'resend';
import { proposalGenerator } from './proposalGenerator';
import { getEnvVar } from './envUtils';

interface EmailAttachment {
  filename: string;
  content: Buffer;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Ensure the app URL has a scheme and no trailing slash
function ensureHttps(url: string): string {
  try {
    let u = (url || '').trim();
    if (!u) return 'https://www.hedwigbot.xyz';
    if (!/^https?:\/\//i.test(u)) {
      u = `https://${u}`;
    }
    // remove trailing slashes
    return u.replace(/\/+$/, '');
  } catch {
    return 'https://www.hedwigbot.xyz';
  }
}

export async function sendEmailWithAttachment(options: EmailOptions): Promise<boolean> {
  try {
    const emailData: any = {
      from: process.env.EMAIL_FROM || 'noreply@hedwigbot.xyz',
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    if (options.replyTo) {
      emailData.reply_to = options.replyTo;
    }

    // Add attachments if provided
    if (options.attachments && options.attachments.length > 0) {
      emailData.attachments = options.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
      }));
    }

    const result = await resend.emails.send(emailData);
    
    if (result.error) {
      console.error('Error sending email:', result.error);
      return false;
    }
    
    console.log('Email sent successfully:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

export async function sendSimpleEmail(to: string, subject: string, html: string): Promise<boolean> {
  return sendEmailWithAttachment({ to, subject, html });
}

// Alias for backward compatibility
export const sendEmail = sendEmailWithAttachment;

// Template functions
export function generateInvoiceEmailTemplate(invoice: any): string {
  const subtotal = invoice.amount;
  const platformFee = subtotal * 0.01; // 1% platform fee deducted from payment
  const total = subtotal; // Total amount to be paid
  const freelancerReceives = subtotal - platformFee; // Amount freelancer receives after fee deduction
  const appUrl = ensureHttps(getEnvVar('NEXT_PUBLIC_APP_URL', 'https://www.hedwigbot.xyz'));

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice ${invoice.invoice_number}</title>
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
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
                        <!-- Header -->
                        <tr>
                            <td style="padding-bottom: 32px;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="text-align: left;">
                                            <h1 style="margin: 0; font-size: 18px; font-weight: 500; color: #262624;">hedwig.</h1>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Invoice Card -->
                        <tr>
                            <td>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                                    <!-- Card Header -->
                                    <tr>
                                        <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                                            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #262624;">Invoice ${invoice.invoice_number}</h2>
                                            <p style="margin: 0; color: #64748b; font-size: 16px;">From ${invoice.freelancer_name}</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Card Content -->
                                    <tr>
                                        <td style="padding: 32px;">
                                            <!-- Greeting -->
                                            <p style="margin: 0 0 24px 0; color: #262624; font-size: 16px; line-height: 1.5;">Dear ${invoice.client_name},</p>
                                            <p style="margin: 0 0 32px 0; color: #64748b; font-size: 16px; line-height: 1.5;">Please find your invoice for the following project:</p>
                                            
                                            <!-- Project Details -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                                                <tr>
                                                    <td>
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">Project Details</h3>
                                                        
                                                        <!-- Description Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Description:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${invoice.project_description}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        ${invoice.deliverables ? `
                                                        <!-- Deliverables Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Deliverables:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${invoice.deliverables}</td>
                                                            </tr>
                                                        </table>
                                                        ` : ''}
                                                        
                                                        <!-- Due Date Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Due Date:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${invoice.due_date}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Payment Summary -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 32px;">
                                                <tr>
                                                    <td style="padding: 24px;">
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">Payment Summary</h3>
                                                        
                                                        <!-- Invoice Amount -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px;">Invoice Amount:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500; text-align: right;">${subtotal.toLocaleString()} ${invoice.currency}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Platform Fee -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px;">Platform Fee (1% deducted):</td>
                                                                <td style="color: #64748b; font-size: 14px; text-align: right;">-${platformFee.toLocaleString()} ${invoice.currency}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Freelancer Receives -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px;">Freelancer Receives:</td>
                                                                <td style="color: #64748b; font-size: 14px; text-align: right;">${freelancerReceives.toLocaleString()} ${invoice.currency}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Total Due -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #262624; font-size: 18px; font-weight: 600;">Total Due:</td>
                                                                <td style="color: #8e01bb; font-size: 24px; font-weight: 700; text-align: right;">${total.toLocaleString()} ${invoice.currency}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Payment Method -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-radius: 6px; padding: 16px; margin-bottom: 32px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        <p style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 600;">💰 Payment Method</p>
                                                        <p style="margin: 0; color: #92400e; font-size: 12px;">USDC on Base Network</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Pay Button -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                                            <tr>
                                                                <td style="background-color: #8e01bb; border-radius: 8px;">
                                                                    <a href="${appUrl}/invoice/${invoice.id}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.2; white-space: nowrap;">Pay Invoice</a>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Footer Message -->
                                            <p style="margin: 0 0 16px 0; color: #64748b; font-size: 14px; line-height: 1.5;">If you have any questions about this invoice, please don't hesitate to contact me.</p>
                                            
                                            <p style="margin: 0; color: #262624; font-size: 14px; line-height: 1.5;">
                                                Best regards,<br>
                                                <strong>${invoice.freelancer_name}</strong><br>
                                                <span style="color: #64748b;">${invoice.freelancer_email}</span>
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
    </body>
    </html>
  `;
}

// Payment link email template
export function generatePaymentLinkEmailTemplate(paymentData: any): string {
  return `
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
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
                        <!-- Header -->
                        <tr>
                            <td style="padding-bottom: 32px;">
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
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                                    <!-- Card Header -->
                                    <tr>
                                        <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                                            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #262624;">Payment Request</h2>
                                            <p style="margin: 0; color: #64748b; font-size: 16px;">from ${paymentData.sender_name || 'Your Service Provider'}</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Card Content -->
                                    <tr>
                                        <td style="padding: 32px;">
                                            ${paymentData.custom_message ? `
                                            <!-- Custom Message -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #8e01bb;">
                                                <tr>
                                                    <td>
                                                        <p style="margin: 0; color: #262624; font-size: 16px; line-height: 1.5; font-style: italic;">${paymentData.custom_message}</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            ` : ''}
                                            
                                            <!-- Payment Details -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                                <tr>
                                                    <td style="padding-bottom: 16px;">
                                                        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #262624;">Payment Details</h3>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px;">Description</td>
                                                                <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${paymentData.reason || 'Payment Request'}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 16px 0;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 16px; font-weight: 500;">Total Amount</td>
                                                                <td style="color: #262624; font-weight: 600; font-size: 20px; text-align: right;">${paymentData.amount} ${paymentData.token || 'USDC'}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Payment Button -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        <a href="${paymentData.payment_link}" style="display: inline-block; background-color: #8e01bb; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; line-height: 1.2;">Complete Payment</a>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Alternative Link -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 16px;">
                                                <tr>
                                                    <td>
                                                        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 500;">Alternative access:</p>
                                                        <p style="margin: 0; word-break: break-all; color: #8e01bb; font-size: 12px; font-family: monospace;">${paymentData.payment_link}</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding-top: 32px; text-align: center;">
                                <p style="margin: 0; color: #64748b; font-size: 14px;">This payment request was sent via Hedwig</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `;
}

// Legacy function - kept for backward compatibility but deprecated
export function generateProposalEmailTemplate(proposal: any): string {
  console.warn('generateProposalEmailTemplate is deprecated. Use generateNaturalProposalEmail instead.');
  return generateNaturalProposalEmail(proposal);
}

// New natural language proposal email template - negotiation-focused
export function generateNaturalProposalEmail(htmlContent: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Project Proposal</title>
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
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 650px; margin: 0 auto;">
                        <!-- Header -->
                        <tr>
                            <td style="padding-bottom: 32px;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="text-align: left;">
                                            <h1 style="margin: 0; font-size: 18px; font-weight: 500; color: #262624;">hedwig.</h1>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Proposal Card -->
                        <tr>
                            <td>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                                    <!-- Card Header -->
                                    <tr>
                                        <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                                            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #262624;">Project Proposal</h2>
                                            <p style="margin: 0; color: #64748b; font-size: 16px;">Professional Freelance Services</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Card Content -->
                                    <tr>
                                        <td style="padding: 32px;">
                                            <!-- Proposal Content -->
                                            <div style="font-size: 16px; line-height: 1.6; color: #262624; margin-bottom: 32px;">
                                                ${htmlContent}
                                            </div>
                                            
                                            <!-- Discussion Section -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 32px; border-left: 4px solid #8e01bb;">
                                                <tr>
                                                    <td>
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #8e01bb;">Let's Discuss Your Vision</h3>
                                                        <p style="margin: 0 0 16px 0; color: #262624; font-size: 16px; line-height: 1.5;">I'd love to hear your thoughts on this proposal. If you have any questions, would like to adjust the scope, or want to discuss the timeline or budget, please don't hesitate to reply to this email.</p>
                                                        <p style="margin: 0; color: #262624; font-size: 16px; line-height: 1.5; font-weight: 600;">I'm here to collaborate and ensure this project perfectly matches your needs.</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Next Steps -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                                                <tr>
                                                    <td>
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">Next Steps</h3>
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="padding: 8px 0; color: #64748b; font-size: 14px; vertical-align: top; width: 24px;">1.</td>
                                                                <td style="padding: 8px 0; color: #262624; font-size: 14px; line-height: 1.5;">Review the attached detailed proposal</td>
                                                            </tr>
                                                            <tr>
                                                                <td style="padding: 8px 0; color: #64748b; font-size: 14px; vertical-align: top; width: 24px;">2.</td>
                                                                <td style="padding: 8px 0; color: #262624; font-size: 14px; line-height: 1.5;">Reply with any questions or feedback</td>
                                                            </tr>
                                                            <tr>
                                                                <td style="padding: 8px 0; color: #64748b; font-size: 14px; vertical-align: top; width: 24px;">3.</td>
                                                                <td style="padding: 8px 0; color: #262624; font-size: 14px; line-height: 1.5;">We can schedule a call to discuss further if needed</td>
                                                            </tr>
                                                            <tr>
                                                                <td style="padding: 8px 0; color: #64748b; font-size: 14px; vertical-align: top; width: 24px;">4.</td>
                                                                <td style="padding: 8px 0; color: #262624; font-size: 14px; line-height: 1.5;">Once we're aligned, we can move forward with the project</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Contact CTA -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-radius: 6px; padding: 16px; margin-bottom: 32px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        <p style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 600;">💬 Ready to Get Started?</p>
                                                        <p style="margin: 0; color: #92400e; font-size: 12px;">Reply to this email to discuss your project</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Signature -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid #e2e8f0; padding-top: 24px; margin-bottom: 24px;">
                                                <tr>
                                                    <td>
                                                        <p style="margin: 0 0 16px 0; color: #262624; font-size: 16px; line-height: 1.5; font-weight: 600;">Looking forward to working together!</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Footer -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; line-height: 1.5;">This proposal was created with care to address your specific needs.</p>
                                                        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">Powered by <strong style="color: #8e01bb;">Hedwig</strong> - Connecting great clients with talented freelancers</p>
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
  `;
}