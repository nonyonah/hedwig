import { Resend } from 'resend';
import { proposalGenerator } from './proposalGenerator';

interface EmailAttachment {
  filename: string;
  content: Buffer;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmailWithAttachment(options: EmailOptions): Promise<boolean> {
  try {
    const emailData: any = {
      from: process.env.EMAIL_FROM || 'noreply@hedwigbot.xyz',
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

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

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }
            .invoice-details { background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .amount { font-size: 24px; font-weight: bold; color: #28a745; }
            .payment-methods { background-color: #f8f9fa; padding: 15px; border-radius: 5px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>Invoice ${invoice.invoice_number}</h2>
                <p>From: ${invoice.freelancer_name}</p>
            </div>
            
            <p>Dear ${invoice.client_name},</p>
            
            <p>Please find attached your invoice for the following project:</p>
            
            <div class="invoice-details">
                <h3>Project Details</h3>
                <p><strong>Description:</strong> ${invoice.project_description}</p>
                ${invoice.deliverables ? `<p><strong>Deliverables:</strong> ${invoice.deliverables}</p>` : ''}
                <p><strong>Due Date:</strong> ${invoice.due_date}</p>
                <p><strong>Invoice Amount:</strong> ${subtotal.toLocaleString()} ${invoice.currency}</p>
                <p><strong>Platform Fee (1% deducted):</strong> -${platformFee.toLocaleString()} ${invoice.currency}</p>
                <p><strong>Freelancer Receives:</strong> ${freelancerReceives.toLocaleString()} ${invoice.currency}</p>
                <p class="amount">Total Due: ${total.toLocaleString()} ${invoice.currency}</p>
            </div>
            
            <div class="payment-methods">
                <h3>Payment Options</h3>
                <ul>
                    <li>💰 USDC on Base Network</li>
                </ul>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/invoice/${invoice.id}" class="button">Pay Now</a>
            </div>
            
            <p>If you have any questions about this invoice, please don't hesitate to contact me.</p>
            
            <p>Best regards,<br>
            ${invoice.freelancer_name}<br>
            ${invoice.freelancer_email}</p>
        </div>
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
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.8; color: #2d3748; margin: 0; padding: 0; background-color: #f7fafc; }
            .container { max-width: 650px; margin: 0 auto; padding: 30px 20px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
            .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
            .logo { font-size: 24px; font-weight: 600; color: #2563eb; margin-bottom: 10px; }
            .tagline { color: #64748b; font-size: 16px; font-style: italic; }
            .proposal-content { font-size: 16px; line-height: 1.8; margin: 30px 0; }
            .proposal-content p { margin-bottom: 20px; }
            .proposal-content h3 { color: #1e293b; margin-top: 30px; margin-bottom: 15px; font-weight: 600; }
            .discussion-section { background-color: #f8fafc; padding: 25px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #3b82f6; }
            .discussion-section h3 { margin-top: 0; color: #1e40af; }
            .contact-info { background-color: #fefefe; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e2e8f0; }
            .footer { text-align: center; padding: 25px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; margin-top: 40px; }
            .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
            .highlight { background-color: #fef3c7; padding: 2px 6px; border-radius: 3px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">HEDWIG</div>
                <div class="tagline">Professional Freelance Proposals</div>
            </div>
            
            <div class="proposal-content">
                ${htmlContent}
            </div>
            
            <div class="discussion-section">
                <h3>Let's Discuss Your Vision</h3>
                <p>I'd love to hear your thoughts on this proposal. If you have any questions, would like to adjust the scope, or want to discuss the timeline or budget, please don't hesitate to reply to this email.</p>
                <p><strong>I'm here to collaborate and ensure this project perfectly matches your needs.</strong></p>
            </div>
            
            <div class="contact-info">
                <p><strong>Next Steps:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Review the attached detailed proposal</li>
                    <li>Reply with any questions or feedback</li>
                    <li>We can schedule a call to discuss further if needed</li>
                    <li>Once we're aligned, we can move forward with the project</li>
                </ul>
            </div>
            
            <div class="signature">
                <p>Looking forward to working together!</p>
            </div>
            
            <div class="footer">
                <p>This proposal was created with care to address your specific needs.</p>
                <p>Powered by <strong>Hedwig</strong> - Connecting great clients with talented freelancers</p>
            </div>
        </div>
    </body>
    </html>
  `;
}