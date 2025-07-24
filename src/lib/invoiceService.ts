import { supabase } from './supabase';
import { generateInvoicePDF } from './htmlPDFService';

export interface InvoiceData {
  id?: string;
  freelancer_name: string;
  freelancer_email: string;
  client_name: string;
  client_email: string;
  project_description: string;
  deliverables: string;
  price: number;
  amount: number;
  is_split_payment?: boolean;
  split_details?: any;
  milestones?: any;
  wallet_address: string;
  blockchain: 'base' | 'optimism' | 'bnb' | 'celo';
  status?: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue';
  date_created?: string;
  invoice_number?: string;
  due_date?: string;
  payment_instructions?: string;
  additional_notes?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  price: number;
  total: number;
}

// Generate unique invoice number
export function generateInvoiceNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `#${timestamp}${random}`;
}

// Create invoice in database
export async function createInvoice(invoiceData: Omit<InvoiceData, 'id' | 'date_created'>): Promise<InvoiceData> {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        ...invoiceData,
        status: invoiceData.status || 'draft'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating invoice:', error);
      const errorMessage = error.message || error.details || JSON.stringify(error);
      throw new Error(`Failed to create invoice: ${errorMessage}`);
    }

    return data;
  } catch (error) {
    console.error('Error in createInvoice:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to create invoice: ${String(error)}`);
  }
}

// Get invoice by ID
export async function getInvoice(invoiceId: string): Promise<InvoiceData | null> {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error) {
      console.error('Error fetching invoice:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getInvoice:', error);
    return null;
  }
}

// Update invoice status
export async function updateInvoiceStatus(invoiceId: string, status: InvoiceData['status']): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', invoiceId);

    if (error) {
      console.error('Error updating invoice status:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateInvoiceStatus:', error);
    return false;
  }
}

// Get invoices by freelancer email
export async function getInvoicesByFreelancer(freelancerEmail: string): Promise<InvoiceData[]> {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('freelancer_email', freelancerEmail)
      .order('date_created', { ascending: false });

    if (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getInvoicesByFreelancer:', error);
    return [];
  }
}

// Send invoice via email
export async function sendInvoiceEmail(invoiceId: string): Promise<boolean> {
  try {
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice);
    
    // Create payment link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const paymentUrl = `${baseUrl}/pay/${invoiceId}`;

    // Send email using Resend (you'll need to implement this)
    const emailSent = await sendEmailWithAttachment({
      to: invoice.client_email,
      subject: `Invoice ${invoice.invoice_number || generateInvoiceNumber()} from ${invoice.freelancer_name}`,
      html: generateInvoiceEmailHTML(invoice, paymentUrl),
      attachments: [{
        filename: `invoice-${invoice.invoice_number || 'document'}.pdf`,
        content: pdfBuffer
      }]
    });

    if (emailSent) {
      // Update invoice status to 'sent'
      await updateInvoiceStatus(invoiceId, 'sent');
    }

    return emailSent;
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return false;
  }
}

// Generate email HTML template
function generateInvoiceEmailHTML(invoice: InvoiceData, paymentUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a2d2ff 0%, #8bb8ff 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e0e0e0; }
        .button { display: inline-block; background: #a2d2ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Invoice from ${invoice.freelancer_name}</h1>
          <p>Invoice ${invoice.invoice_number || generateInvoiceNumber()}</p>
        </div>
        <div class="content">
          <p>Dear ${invoice.client_name},</p>
          <p>Please find attached your invoice for the completed work on: <strong>${invoice.project_description}</strong></p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Invoice Details:</h3>
            <p><strong>Amount:</strong> $${invoice.amount.toFixed(2)}</p>
            <p><strong>Due Date:</strong> ${invoice.due_date || 'Upon receipt'}</p>
            <p><strong>Payment Method:</strong> Online payment via secure link</p>
          </div>

          <p>You can pay this invoice securely online by clicking the button below:</p>
          <div style="text-align: center;">
            <a href="${paymentUrl}" class="button">Pay Invoice Online</a>
          </div>
          
          <p>If you have any questions about this invoice, please don't hesitate to contact me.</p>
          <p>Thank you for your business!</p>
          
          <p>Best regards,<br>${invoice.freelancer_name}</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply to this email address.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Email sending function (placeholder - you'll need to implement with Resend)
async function sendEmailWithAttachment(emailData: {
  to: string;
  subject: string;
  html: string;
  attachments: Array<{ filename: string; content: Buffer }>;
}): Promise<boolean> {
  try {
    // Import Resend dynamically
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'invoices@hedwigbot.xyz',
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      attachments: emailData.attachments
    });

    if (error) {
      console.error('Error sending email:', error);
      return false;
    }

    console.log('Email sent successfully:', data);
    return true;
  } catch (error) {
    console.error('Error in sendEmailWithAttachment:', error);
    return false;
  }
}

// Process invoice input from user message
export async function processInvoiceInput(
  userInput: string,
  user: { id: string; phone_number: string; email?: string; name?: string }
): Promise<{ message: string; invoiceId?: string }> {
  try {
    console.log(`[processInvoiceInput] Processing invoice input for user ${user.id}`);
    
    // Parse invoice data from user input (you can enhance this with AI)
    const invoiceData = parseInvoiceFromInput(userInput, user);
    
    // Create invoice in database
    const invoice = await createInvoice(invoiceData);
    
    console.log(`[processInvoiceInput] Invoice created with ID: ${invoice.id}`);
    
    // Generate invoice number if not provided
    const invoiceNumber = invoice.invoice_number || generateInvoiceNumber();
    
    // Create payment link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const paymentUrl = `${baseUrl}/pay/${invoice.id}`;
    
    const responseMessage = `Invoice created successfully! 📄

Invoice #${invoiceNumber}
Client: ${invoice.client_name}
Amount: $${invoice.amount.toFixed(2)}

Would you like me to send this invoice to ${invoice.client_email} via email? 

You can also share the payment link directly: ${paymentUrl}`;
    
    return { message: responseMessage, invoiceId: invoice.id };
  } catch (error) {
    console.error('Error processing invoice input:', error);
    return { 
      message: 'Sorry, I encountered an error while creating your invoice. Please try again or provide more details.' 
    };
  }
}

// Parse invoice data from user input (basic implementation)
function parseInvoiceFromInput(
  userInput: string, 
  user: { id: string; phone_number: string; email?: string; name?: string }
): Omit<InvoiceData, 'id' | 'date_created'> {
  // This is a basic parser - you can enhance it with AI/NLP
  const defaultData: Omit<InvoiceData, 'id' | 'date_created'> = {
    freelancer_name: user.name || 'Freelancer',
    freelancer_email: user.email || 'freelancer@example.com',
    client_name: 'Client',
    client_email: 'client@example.com',
    project_description: 'Professional Services',
    deliverables: 'Project completion',
    price: 1000,
    amount: 1000,
    wallet_address: '0x...',
    blockchain: 'base',
    status: 'draft',
    invoice_number: generateInvoiceNumber(),
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
    payment_instructions: 'Payment via online link',
    additional_notes: 'Thank you for your business!'
  };

  // You can add more sophisticated parsing logic here
  return defaultData;
}