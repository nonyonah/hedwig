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
    // Validate recipient email to prevent mis-sends
    const recipient = (options.to || '').trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
    if (!recipient || !isValidEmail) {
      console.warn('Skipping email send: invalid or empty recipient', { to: options.to });
      return false;
    }

    const emailData: any = {
      from: process.env.EMAIL_FROM || 'noreply@hedwigbot.xyz',
      to: recipient,
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
  const amount = Number(invoice?.amount) || 0;
  const currency = invoice?.currency || invoice?.token || 'USDC';
  const invoiceNumber = invoice?.invoice_number || invoice?.invoiceNumber || '—';
  const freelancerName = invoice?.freelancer_name || 'Freelancer';
  const clientName = invoice?.client_name || 'Client';
  const description = invoice?.project_description || 'Project work';
  const deliverables = invoice?.deliverables;
  const dueDateRaw = invoice?.due_date;
  const dueDate = dueDateRaw ? new Date(dueDateRaw).toLocaleDateString() : '—';
  const freelancerEmail = invoice?.freelancer_email || '';
  const invoiceId = invoice?.id || invoice?.invoice_id || '';

  const subtotal = amount;
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
        <title>Invoice ${invoiceNumber}</title>
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
                                            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #262624;">Invoice ${invoiceNumber}</h2>
                                            <p style="margin: 0; color: #64748b; font-size: 16px;">From ${freelancerName}</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Card Content -->
                                    <tr>
                                        <td style="padding: 32px;">
                                            <!-- Greeting -->
                                            <p style="margin: 0 0 24px 0; color: #262624; font-size: 16px; line-height: 1.5;">Dear ${clientName},</p>
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
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${description}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        ${deliverables ? `
                                                        <!-- Deliverables Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Deliverables:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${deliverables}</td>
                                                            </tr>
                                                        </table>
                                                        ` : ''}
                                                        
                                                        <!-- Due Date Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Due Date:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${dueDate}</td>
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
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500; text-align: right;">${subtotal.toLocaleString()} ${currency}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Platform Fee -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px;">Platform Fee (1% deducted):</td>
                                                                <td style="color: #64748b; font-size: 14px; text-align: right;">-${platformFee.toLocaleString()} ${currency}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Freelancer Receives -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px;">Freelancer Receives:</td>
                                                                <td style="color: #64748b; font-size: 14px; text-align: right;">${freelancerReceives.toLocaleString()} ${currency}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Total Due -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #262624; font-size: 18px; font-weight: 600;">Total Due:</td>
                                                                <td style="color: #8e01bb; font-size: 24px; font-weight: 700; text-align: right;">${total.toLocaleString()} ${currency}</td>
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
                                                                    ${invoiceId ? `<a href="${appUrl}/invoice/${invoiceId}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.2; white-space: nowrap;">Pay Invoice</a>` : `<span style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.2; white-space: nowrap;">Invoice Link Unavailable</span>`}
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
                                                <strong>${freelancerName}</strong><br>
                                                <span style="color: #64748b;">${freelancerEmail}</span>
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
  const senderName = paymentData?.sender_name || 'Your Service Provider';
  const customMessage = paymentData?.custom_message;
  const reason = paymentData?.reason || 'Payment Request';
  const amount = Number(paymentData?.amount) || 0;
  const token = paymentData?.token || 'USDC';
  const paymentLink = paymentData?.payment_link || '#';
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
                                            <p style="margin: 0; color: #64748b; font-size: 16px;">from ${senderName}</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Card Content -->
                                    <tr>
                                        <td style="padding: 32px;">
                                            ${customMessage ? `
                                            <!-- Custom Message -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #8e01bb;">
                                                <tr>
                                                    <td>
                                                        <p style="margin: 0; color: #262624; font-size: 16px; line-height: 1.5; font-style: italic;">${customMessage}</p>
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
                                                                <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${reason}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding: 16px 0;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 16px; font-weight: 500;">Total Amount</td>
                                                                <td style="color: #262624; font-weight: 600; font-size: 20px; text-align: right;">${amount} ${token}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Payment Button -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        ${paymentLink !== '#' ? `<a href="${paymentLink}" style="display: inline-block; background-color: #8e01bb; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; line-height: 1.2;">Complete Payment</a>` : `<span style="display: inline-block; background-color: #8e01bb; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; line-height: 1.2;">Payment Link Unavailable</span>`}
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Alternative Link -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 16px;">
                                                <tr>
                                                    <td>
                                                        ${paymentLink !== '#' ? `<p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 500;">Alternative access:</p>
                                                        <p style="margin: 0; word-break: break-all; color: #8e01bb; font-size: 12px; font-family: monospace;">${paymentLink}</p>` : ''}
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

// Contract email template
export function generateContractEmailTemplate(contract: any): string {
  const appUrl = ensureHttps(process.env.NEXT_PUBLIC_APP_URL || 'https://www.hedwigbot.xyz');
  const contractId = contract?.id || contract?.contractId || '';
  const projectTitle = contract?.projectTitle || contract?.project_title || 'Project Contract';
  const freelancerName = contract?.freelancerName || contract?.freelancer_name || 'Freelancer';
  const clientName = contract?.clientName || contract?.client_name || 'Client';
  const amount = Number(contract?.paymentAmount || contract?.total_amount || 0);
  const tokenType = contract?.tokenType || contract?.token_type || 'USDC';
  const chain = contract?.chain || 'Base';
  const deadline = contract?.deadline ? new Date(contract.deadline).toLocaleDateString() : '—';
  const contractHash = contract?.contractHash || contract?.legal_contract_hash || '';
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contract Draft - ${projectTitle}</title>
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
                        
                        <!-- Contract Card -->
                        <tr>
                            <td>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                                    <!-- Card Header -->
                                    <tr>
                                        <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                                            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #262624;">Contract Draft Ready</h2>
                                            <p style="margin: 0; color: #64748b; font-size: 16px;">${projectTitle}</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Card Content -->
                                    <tr>
                                        <td style="padding: 32px;">
                                            <!-- Greeting -->
                                            <p style="margin: 0 0 24px 0; color: #262624; font-size: 16px; line-height: 1.5;">Dear ${clientName},</p>
                                            <p style="margin: 0 0 32px 0; color: #64748b; font-size: 16px; line-height: 1.5;">Your contract draft for <strong>${projectTitle}</strong> has been generated and is ready for review.</p>
                                            
                                            <!-- Contract Details -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                                                <tr>
                                                    <td>
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">Contract Details</h3>
                                                        
                                                        <!-- Project Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Project:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${projectTitle}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Freelancer Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Freelancer:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${freelancerName}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Amount Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Amount:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${amount.toLocaleString()} ${tokenType}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Blockchain Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Blockchain:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${chain}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Deadline Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Deadline:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${deadline}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Contract ID Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Contract ID:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${contractId}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Review Button -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                                            <tr>
                                                                <td style="background-color: #8e01bb; border-radius: 8px;">
                                                                    ${contractId ? `<a href="${appUrl}/contracts/approve/${contractId}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.2; white-space: nowrap;">📄 Review & Approve Contract</a>` : `<span style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.2; white-space: nowrap;">Contract Link Unavailable</span>`}
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Security Note -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin-bottom: 32px;">
                                                <tr>
                                                    <td>
                                                        <p style="margin: 0 0 8px 0; color: #1565c0; font-size: 14px; font-weight: 600;">🔐 Security Note</p>
                                                        <p style="margin: 0; color: #1976d2; font-size: 12px; line-height: 1.4;">This contract is secured with blockchain technology. Document hash: <code style="background: rgba(255,255,255,0.7); padding: 2px 4px; border-radius: 3px; font-family: monospace;">${contractHash ? contractHash.substring(0, 16) + '...' : 'Generating...'}</code></p>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <!-- Instructions -->
                                            <p style="margin: 0 0 16px 0; color: #64748b; font-size: 14px; line-height: 1.5;">Please review the contract carefully and approve it to proceed with the project. Once approved, the smart contract will be deployed and funds can be securely escrowed.</p>
                                            
                                            <p style="margin: 0; color: #262624; font-size: 14px; line-height: 1.5;">
                                                If you have any questions or need modifications, please contact ${freelancerName} directly.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding-top: 32px; text-align: center;">
                                <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">This contract was generated using Hedwig AI-powered legal contract generation.</p>
                                <p style="margin: 0; color: #adb5bd; font-size: 12px;">
                                    Powered by <a href="${appUrl}" style="color: #8e01bb; text-decoration: none;">Hedwig</a>
                                </p>
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