import { supabase } from './supabase';

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

// Send invoice via email (PDF generation disabled)
export async function sendInvoiceEmail(invoiceId: string): Promise<boolean> {
  try {
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Create payment link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const paymentUrl = `${baseUrl}/pay/${invoiceId}`;

    // Send email without PDF attachment
    const emailSent = await sendEmailWithoutAttachment({
      to: invoice.client_email,
      subject: `Invoice ${invoice.invoice_number || generateInvoiceNumber()} from ${invoice.freelancer_name}`,
      html: generateInvoiceEmailHTML(invoice, paymentUrl)
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

// Generate email HTML template (Gmail compatible)
function generateInvoiceEmailHTML(invoice: InvoiceData, paymentUrl: string): string {
  const invoiceNumber = invoice.invoice_number || generateInvoiceNumber();
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', { 
    day: 'numeric',
    month: 'short', 
    year: 'numeric' 
  }).replace(',', '') : '21st Aug, 2025';

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
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 448px; margin: 0 auto;">
              <!-- Header -->
              <tr>
                <td style="padding-bottom: 64px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="text-align: left;">
                        <h1 style="margin: 0; font-size: 18px; font-weight: 500; color: #262624;">albus.</h1>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Invoice Card -->
              <tr>
                <td>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                    <!-- Card Header -->
                    <tr>
                      <td style="padding: 24px 24px 32px 24px; text-align: center;">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #262624;">Invoice ${invoiceNumber}</h2>
                      </td>
                    </tr>
                    
                    <!-- Card Content -->
                    <tr>
                      <td style="padding: 0 24px 24px 24px;">
                        <!-- Invoice Details -->
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <!-- From Row -->
                          <tr>
                            <td style="padding-bottom: 16px;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">From</td>
                                  <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${invoice.freelancer_name}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          
                          <!-- To Row -->
                          <tr>
                            <td style="padding-bottom: 16px;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">To</td>
                                  <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${invoice.client_name}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          
                          <!-- Due Date Row -->
                          <tr>
                            <td style="padding-bottom: 16px;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">Due Date</td>
                                  <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">${dueDate}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          
                          <!-- Total Due Row -->
                          <tr>
                            <td style="padding-bottom: 24px;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #262624; opacity: 0.6; font-size: 14px; text-align: left;">Total Due</td>
                                  <td style="color: #262624; font-weight: 500; font-size: 14px; text-align: right;">$${invoice.amount.toFixed(0)}</td>
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
                                    <a href="${paymentUrl}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; line-height: 1.2; white-space: nowrap;">Pay this invoice</a>
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
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Email sending function without attachments
async function sendEmailWithoutAttachment(emailData: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  try {
    // Import Resend dynamically
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Add timeout to email sending
    const emailPromise = resend.emails.send({
      from: process.env.FROM_EMAIL || 'invoices@hedwigbot.xyz',
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html
    });

    // Race between email sending and timeout
    const { data, error } = await Promise.race([
      emailPromise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Email sending timed out after 30 seconds')), 30000)
      )
    ]);

    if (error) {
      console.error('Error sending email:', error);
      return false;
    }

    console.log('Email sent successfully:', data);
    return true;
  } catch (error) {
    console.error('Error in sendEmailWithoutAttachment:', error);
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