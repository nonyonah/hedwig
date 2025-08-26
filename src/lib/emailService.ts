import { Resend } from 'resend';

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

export function generateProposalEmailTemplate(proposal: any): string {
  const subtotal = proposal.amount;
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
            .proposal-details { background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .investment { font-size: 24px; font-weight: bold; color: #28a745; }
            .next-steps { background-color: #f8f9fa; padding: 15px; border-radius: 5px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>Project Proposal ${proposal.proposal_number}</h2>
                <p>From: ${proposal.freelancer_name}</p>
            </div>
            
            <p>Dear ${proposal.client_name},</p>
            
            <p>Thank you for considering our services. Please find attached our detailed proposal for your project.</p>
            
            <div class="proposal-details">
                <h3>Project Overview</h3>
                <p><strong>Description:</strong> ${proposal.project_description}</p>
                ${proposal.scope_of_work ? `<p><strong>Scope:</strong> ${proposal.scope_of_work}</p>` : ''}
                ${proposal.timeline ? `<p><strong>Timeline:</strong> ${proposal.timeline}</p>` : ''}
                <p><strong>Project Amount:</strong> ${subtotal.toLocaleString()} ${proposal.currency}</p>
                <p><strong>Platform Fee (1% deducted):</strong> -${platformFee.toLocaleString()} ${proposal.currency}</p>
                <p><strong>Freelancer Receives:</strong> ${freelancerReceives.toLocaleString()} ${proposal.currency}</p>
                <p class="investment">Total Investment: ${total.toLocaleString()} ${proposal.currency}</p>
            </div>
            
            <div class="next-steps">
                <h3>Next Steps</h3>
                <ol>
                    <li>Review the attached proposal</li>
                    <li>Accept and make payment to begin work</li>
                    <li>Project kickoff within 24 hours</li>
                </ol>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/proposal/${proposal.id}" class="button">Accept Proposal</a>
            </div>
            
            <p>We're excited about the opportunity to work with you and deliver exceptional results.</p>
            
            <p>Best regards,<br>
            ${proposal.freelancer_name}<br>
            ${proposal.freelancer_email}</p>
        </div>
    </body>
    </html>
  `;
}