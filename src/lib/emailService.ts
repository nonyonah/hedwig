import { Resend } from 'resend';
import { proposalGenerator } from './proposalGenerator';
import { getEnvVar } from './envUtils';
import { rateLimitService } from './rateLimitService';

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

export async function sendEmailWithAttachment(options: EmailOptions, retries: number = 3): Promise<boolean> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Validate recipient email to prevent mis-sends
      const recipient = (options.to || '').trim();
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
      if (!recipient || !isValidEmail) {
        console.warn('Skipping email send: invalid or empty recipient', { to: options.to });
        return false;
      }

      // Check rate limits to prevent spam
      if (!rateLimitService.canSendEmail(recipient)) {
        const status = rateLimitService.getRateLimitStatus(recipient);
        console.warn(`Rate limit exceeded for ${recipient}. Hourly: ${status.hourly.count}/${status.hourly.limit}, Daily: ${status.daily.count}/${status.daily.limit}`);
        return false;
      }

      // Check if RESEND_API_KEY is configured
      if (!process.env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY is not configured');
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
        lastError = result.error;
        console.error(`Email send attempt ${attempt}/${retries} failed:`, result.error);
        
        // Don't retry for certain errors
        if (result.error.name === 'validation_error' || result.error.name === 'invalid_parameter') {
          console.error('Non-retryable email error:', result.error);
          return false;
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < retries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        return false;
      }
      
      console.log(`Email sent successfully on attempt ${attempt}:`, result.data?.id);
      
      // Record the successful email send for rate limiting
      rateLimitService.recordEmailSent(recipient);
      
      return true;
    } catch (error) {
      lastError = error;
      console.error(`Email send attempt ${attempt}/${retries} failed with exception:`, error);
      
      // Wait before retrying
      if (attempt < retries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  console.error(`All ${retries} email send attempts failed. Last error:`, lastError);
  return false;
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
  const projectDescription = contract?.projectDescription || contract?.project_description || 'No description provided';
  const freelancerName = contract?.freelancerName || contract?.freelancer_name || 'Freelancer';
  const clientName = contract?.clientName || contract?.client_name || 'Client';
  const amount = Number(contract?.paymentAmount || contract?.total_amount || 0);
  const tokenType = contract?.tokenType || contract?.token_type || 'USDC';
  const chain = contract?.chain || 'Base';
  const deadline = contract?.deadline ? new Date(contract.deadline).toLocaleDateString() : '—';
  const contractHash = contract?.contractHash || contract?.legal_contract_hash || '';
  const milestones = contract?.milestones || [];
  const createdAt = contract?.createdAt || contract?.created_at ? new Date(contract.createdAt || contract.created_at).toLocaleDateString() : new Date().toLocaleDateString();
  
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
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">📋 Project Details</h3>
                                                        
                                                        <!-- Project Title Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Project:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${projectTitle}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Description Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%; vertical-align: top;">Description:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500; line-height: 1.5;">${projectDescription}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Contract ID Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Contract ID:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500; font-family: monospace;">${contractId}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Created Date Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Created:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${createdAt}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>

                                            <!-- Parties Section -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0fdf4; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                                                <tr>
                                                    <td>
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">👥 Parties</h3>
                                                        
                                                        <!-- Client Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Client:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${clientName}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Freelancer Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Freelancer:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${freelancerName}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>

                                            <!-- Payment Terms Section -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                                                <tr>
                                                    <td>
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">💰 Payment Terms</h3>
                                                        
                                                        <!-- Total Amount Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Total Amount:</td>
                                                                <td style="color: #d97706; font-size: 18px; font-weight: 700;">${amount.toLocaleString()} ${tokenType}</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Blockchain Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Blockchain:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${chain.toUpperCase()} Network</td>
                                                            </tr>
                                                        </table>
                                                        
                                                        <!-- Deadline Row -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                            <tr>
                                                                <td style="color: #64748b; font-size: 14px; padding-right: 16px; width: 30%;">Project Deadline:</td>
                                                                <td style="color: #262624; font-size: 14px; font-weight: 500;">${deadline}</td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>

                                            ${milestones && milestones.length > 0 ? `
                                            <!-- Milestones Section -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3e8ff; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                                                <tr>
                                                    <td>
                                                        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">🎯 Project Milestones</h3>
                                                        
                                                        ${milestones.map((milestone: any, index: number) => `
                                                        <!-- Milestone ${index + 1} -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${index % 2 === 0 ? '#ffffff' : '#faf5ff'}; border-radius: 6px; padding: 16px; margin-bottom: 12px; border: 1px solid #e9d5ff;">
                                                            <tr>
                                                                <td>
                                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
                                                                        <tr>
                                                                            <td style="color: #7c3aed; font-size: 14px; font-weight: 600;">Milestone ${index + 1}: ${milestone.title || 'Untitled'}</td>
                                                                            <td style="color: #059669; font-size: 14px; font-weight: 600; text-align: right;">${milestone.amount || 0} ${tokenType}</td>
                                                                        </tr>
                                                                    </table>
                                                                    
                                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
                                                                        <tr>
                                                                            <td style="color: #64748b; font-size: 13px; line-height: 1.4;">${milestone.description || 'No description provided'}</td>
                                                                        </tr>
                                                                    </table>
                                                                    
                                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                                        <tr>
                                                                            <td style="color: #64748b; font-size: 12px;">Deadline: ${milestone.deadline ? new Date(milestone.deadline).toLocaleDateString() : 'Not specified'}</td>
                                                                            <td style="color: #64748b; font-size: 12px; text-align: right;">Status: ${(milestone.status || 'pending').toUpperCase()}</td>
                                                                        </tr>
                                                                    </table>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                        `).join('')}
                                                    </td>
                                                </tr>
                                            </table>
                                            ` : ''}
                                            
                                            <!-- Action Button -->
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                                <tr>
                                                    <td style="text-align: center;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                                            <tr>
                                                                <td style="background-color: #8e01bb; border-radius: 8px;">
                                                                    ${contractId ? `<a href="${appUrl}/contracts/${contractId}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.2; white-space: nowrap;">📄 View & Sign Contract</a>` : `<span style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.2; white-space: nowrap;">Contract Link Unavailable</span>`}
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
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #e0f2fe; border-left: 4px solid #0288d1; border-radius: 4px; padding: 20px; margin-bottom: 24px;">
                                                <tr>
                                                    <td>
                                                        <h4 style="margin: 0 0 12px 0; color: #01579b; font-size: 16px; font-weight: 600;">📋 Next Steps</h4>
                                                        <ol style="margin: 0; padding-left: 20px; color: #0277bd; font-size: 14px; line-height: 1.6;">
                                                            <li style="margin-bottom: 8px;"><strong>Review</strong> the contract details above carefully</li>
                                                            <li style="margin-bottom: 8px;"><strong>Click "View & Sign Contract"</strong> to see the full contract</li>
                                                            <li style="margin-bottom: 8px;"><strong>Connect your wallet</strong> on the contract page</li>
                                                            <li style="margin-bottom: 8px;"><strong>Sign the contract</strong> to approve the project</li>
                                                            <li><strong>Start collaborating</strong> with ${freelancerName} on your project!</li>
                                                        </ol>
                                                    </td>
                                                </tr>
                                            </table>
                                            
                                            <p style="margin: 0 0 16px 0; color: #64748b; font-size: 14px; line-height: 1.5;">
                                                <strong>💰 Payment Process:</strong> Once approved, an invoice will be automatically generated and sent to you. 
                                                You can pay the invoice using cryptocurrency, and ${freelancerName} will be notified to begin work on your project.
                                            </p>
                                            
                                            <p style="margin: 0; color: #262624; font-size: 14px; line-height: 1.5;">
                                                <strong>❓ Questions?</strong> Contact ${freelancerName} directly or reach out to our support team if you need any assistance.
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
// Contract completion email template
export function generateContractCompletionEmailTemplate(data: {
  contractId: string;
  projectTitle: string;
  clientEmail: string;
  totalAmount: number;
  tokenType: string;
  completionDetails: string;
  freelancerName?: string;
}) {
  const appUrl = ensureHttps(process.env.WEBAPP_BASE_URL);
  const approvalUrl = `${appUrl}/contracts/approve/${data.contractId}`;
  const changesUrl = `${appUrl}/contracts/request-changes/${data.contractId}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Ready for Your Review</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc;">
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

                    <!-- Main Card -->
                    <tr>
                        <td>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                                <!-- Card Header -->
                                <tr>
                                    <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #f1f5f9; background: linear-gradient(135deg, #8e01bb 0%, #6b0aa8 100%); border-radius: 12px 12px 0 0;">
                                        <div style="color: white;">
                                            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                                            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600;">Project Completed!</h2>
                                            <p style="margin: 0; font-size: 16px; opacity: 0.9;">Your project is ready for review and approval</p>
                                        </div>
                                    </td>
                                </tr>

                                <!-- Card Content -->
                                <tr>
                                    <td style="padding: 32px;">
                                        <!-- Project Details -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                                            <tr>
                                                <td>
                                                    <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">Project Details</h3>
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 120px;">Project:</td>
                                                            <td style="padding: 8px 0; color: #262624; font-size: 14px; font-weight: 600;">${data.projectTitle}</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Amount:</td>
                                                            <td style="padding: 8px 0; color: #262624; font-size: 14px; font-weight: 600;">${data.totalAmount} ${data.tokenType}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- Completion Details -->
                                        <div style="margin-bottom: 32px;">
                                            <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #262624;">Work Completed</h3>
                                            <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 6px; padding: 20px; margin-bottom: 24px;">
                                                <p style="margin: 0; color: #15803d; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${data.completionDetails}</p>
                                            </div>
                                        </div>

                                        <!-- Action Buttons -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                            <tr>
                                                <td style="padding: 8px; text-align: center;">
                                                    <a href="${approvalUrl}" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">✅ Approve & Release Payment</a>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; text-align: center;">
                                                    <a href="${changesUrl}" style="display: inline-block; background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">🔄 Request Changes</a>
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- Instructions -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin-bottom: 24px;">
                                            <tr>
                                                <td>
                                                    <h4 style="margin: 0 0 12px 0; color: #92400e; font-size: 16px; font-weight: 600;">📋 What's Next?</h4>
                                                    <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 14px; line-height: 1.6;">
                                                        <li style="margin-bottom: 8px;"><strong>Review</strong> the completed work described above</li>
                                                        <li style="margin-bottom: 8px;">If satisfied, <strong>click "Approve & Release Payment"</strong></li>
                                                        <li style="margin-bottom: 8px;">If changes are needed, <strong>click "Request Changes"</strong> and provide details</li>
                                                        <li>The freelancer will be notified of your decision immediately</li>
                                                    </ul>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin: 0 0 16px 0; color: #64748b; font-size: 14px; line-height: 1.5;">
                                            <strong>⏰ Timeline:</strong> Please review the work within 7 business days. If no action is taken, the project will be considered approved.
                                        </p>

                                        <p style="margin: 0; color: #262624; font-size: 14px; line-height: 1.5;">
                                            <strong>❓ Need Help?</strong> Reply to this email or contact our support team for assistance.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding-top: 32px; text-align: center;">
                            <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">This completion request was sent securely via Hedwig.</p>
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

// Send contract completion email
export async function sendContractCompletionEmail(data: {
  contractId: string;
  projectTitle: string;
  clientEmail: string;
  totalAmount: number;
  tokenType: string;
  completionDetails: string;
  freelancerName?: string;
}) {
  const htmlContent = generateContractCompletionEmailTemplate(data);

  return await sendEmail({
    to: data.clientEmail,
    subject: `Project Completed: ${data.projectTitle}`,
    html: htmlContent
  });
}
