import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';
import { Resend } from 'resend';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export interface CreateInvoiceParams {
  amount: number;
  token: string;
  network: string;
  walletAddress: string;
  userName: string;
  description: string;
  recipientEmail?: string;
  dueDate?: string;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  userId?: string; // Optional creator user ID for FK created_by
}

export interface CreateInvoiceResult {
  success: boolean;
  invoiceLink?: string;
  id?: string;
  error?: string;
}

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  freelancer_name: string;
  client_name: string;
  project_description: string;
  amount: number;
  status: string;
  date_created: string;
  due_date?: string;
  isPaid: boolean;
  totalPaid: number;
}

export async function listInvoices(userName: string): Promise<{ success: boolean; invoices?: InvoiceListItem[]; error?: string }> {
  try {
    // Get invoices for the user
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .eq('freelancer_name', userName)
      .order('date_created', { ascending: false });

    if (invoicesError) {
      console.error('Error fetching invoices:', invoicesError);
      return { success: false, error: 'Failed to fetch invoices' };
    }

    // Get payment information for each invoice
    const invoiceList: InvoiceListItem[] = [];
    
    for (const invoice of invoices || []) {
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount_paid, status')
        .eq('invoice_id', invoice.id)
        .eq('status', 'completed');

      const totalPaid = payments?.reduce((sum, payment) => sum + Number(payment.amount_paid), 0) || 0;
      const isPaid = totalPaid >= Number(invoice.amount);

      invoiceList.push({
        id: invoice.id,
        invoice_number: invoice.invoice_number || `INV-${invoice.id.slice(0, 8)}`,
        freelancer_name: invoice.freelancer_name,
        client_name: invoice.client_name,
        project_description: invoice.project_description,
        amount: Number(invoice.amount),
        status: invoice.status,
        date_created: invoice.date_created,
        due_date: invoice.due_date,
        isPaid,
        totalPaid
      });
    }

    return { success: true, invoices: invoiceList };
  } catch (error) {
    console.error('Error listing invoices:', error);
    return { success: false, error: 'Internal server error' };
  }
}

export async function createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const {
    amount,
    token,
    network,
    walletAddress,
    userName,
    description,
    recipientEmail,
    dueDate,
    items,
    userId
  } = params;

  try {
    // Validate required fields
    if (!amount || !token || !network || !walletAddress || !userName || !description) {
      return {
        success: false,
        error: 'Missing required fields: amount, token, network, walletAddress, userName, description'
      };
    }

    // Validate amount is positive
    if (amount <= 0) {
      return {
        success: false,
        error: 'Amount must be greater than 0'
      };
    }

    // Validate wallet address format (basic Ethereum address validation)
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return {
        success: false,
        error: 'Invalid wallet address format'
      };
    }

    // Validate email format if provided
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return {
        success: false,
        error: 'Invalid email format'
      };
    }

    // Validate network
    const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism', 'celo'];
    
    if (!supportedNetworks.includes(network.toLowerCase())) {
      return {
        success: false,
        error: `Unsupported network. Supported networks: ${supportedNetworks.join(', ')}`
      };
    }

    // Validate token
    const supportedTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'MATIC', 'ARB', 'OP'];
    if (!supportedTokens.includes(token.toUpperCase())) {
      return {
        success: false,
        error: `Unsupported token. Supported tokens: ${supportedTokens.join(', ')}`
      };
    }

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Insert invoice into database
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        freelancer_name: userName,
        freelancer_email: recipientEmail || 'noreply@hedwigbot.xyz',
        client_name: 'Client',
        client_email: recipientEmail || 'noreply@hedwigbot.xyz',
        project_description: description,
        deliverables: description,
        quantity: 1,
        rate: amount,
        price: amount,
        amount: amount,
        wallet_address: walletAddress,
        status: 'draft',
        due_date: dueDate || null,
        additional_notes: items ? JSON.stringify(items) : null,
        created_by: userId || null
      })
      .select('id')
      .single();

    if (error) {
      console.error('Database error:', error);
      return {
        success: false,
        error: 'Failed to create invoice'
      };
    }

    // Build robust base URL for prod/dev
    const vercelUrl = process.env.VERCEL_URL;
    const resolvedBaseUrl = vercelUrl
      ? (vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`)
      : (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz');
    const invoiceLink = `${resolvedBaseUrl}/invoice/${data.id}`;

    // Track invoice creation event
    try {
      const { HedwigEvents } = await import('./posthog');
      await HedwigEvents.invoiceCreated(
        userId || 'anonymous',
        data.id,
        amount,
        token
      );
      console.log('✅ Invoice created event tracked successfully');
    } catch (trackingError) {
      console.error('Error tracking invoice_created event:', trackingError);
    }

    // Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        await sendInvoiceEmail({
          recipientEmail,
          amount,
          token,
          network,
          invoiceLink,
          freelancerName: userName,
          description,
          invoiceNumber,
          dueDate
        });
        console.log(`Invoice email sent to ${recipientEmail}`);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the request if email fails, just log it
      }
    }

    return {
      success: true,
      invoiceLink,
      id: data.id
    };

  } catch (error) {
    console.error('Invoice creation error:', error);
    return {
      success: false,
      error: 'Internal server error'
    };
  }
}

interface SendInvoiceEmailParams {
  recipientEmail: string;
  amount: number;
  token: string;
  network: string;
  invoiceLink: string;
  freelancerName: string;
  description: string;
  invoiceNumber: string;
  dueDate?: string;
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void> {
  const { recipientEmail, amount, token, network, invoiceLink, freelancerName, description, invoiceNumber, dueDate } = params;

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  // Get user data for personalized display name
  const { data: userData } = await supabase
    .from('users')
    .select('email, name')
    .eq('name', freelancerName)
    .single();

  // Always use verified domain for 'from' address to avoid domain verification issues
  const senderEmail = process.env.EMAIL_FROM || 'noreply@hedwigbot.xyz';
  const displayName = userData?.name || freelancerName;
  const userEmail = userData?.email; // Keep user email for display purposes

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .invoice-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
        .button { display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .security-notice { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📄 Invoice ${invoiceNumber}</h1>
        <p>Payment request from ${displayName}</p>
      </div>
      
      <div class="content">
        <div class="invoice-details">
          <h3>Invoice Details</h3>
          <p><strong>From:</strong> ${displayName}${userEmail ? ` (${userEmail})` : ''}</p>
          <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
          <p><strong>Description:</strong> ${description}</p>
          <p><strong>Network:</strong> ${network.toUpperCase()}</p>
          <p><strong>Amount:</strong> ${amount} ${token.toUpperCase()}</p>
          ${dueDate ? `<p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : ''}
        </div>
        
        <div class="security-notice">
          <p><strong>💼 Professional Invoice:</strong> This is an official invoice. Please review all details before proceeding with payment.</p>
        </div>
        
        <div style="text-align: center;">
          <a href="${invoiceLink}" class="button">View & Pay Invoice</a>
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">${invoiceLink}</p>
      </div>
      
      <div class="footer">
        <p>This invoice was sent via Hedwig Bot</p>
        <p>If you have any questions about this invoice, please contact ${displayName} directly.</p>
      </div>
    </body>
    </html>
  `;

  const result = await resend.emails.send({
    from: `${displayName} <${senderEmail}>`,
    to: recipientEmail,
    subject: `Invoice ${invoiceNumber} - ${amount} ${token.toUpperCase()}`,
    html: emailHtml
  });

  if (result.error) {
    const errorMessage = result.error.message || JSON.stringify(result.error) || 'Unknown email error';
    throw new Error(`Failed to send email: ${errorMessage}`);
  }

  // Track invoice sent event
  try {
    const { HedwigEvents } = await import('./posthog');
    await HedwigEvents.invoiceSent('system', {
      invoice_number: invoiceNumber,
      recipient_email: recipientEmail,
      amount: amount,
      currency: token
    });
    console.log('✅ Invoice sent event tracked successfully');
  } catch (trackingError) {
    console.error('Error tracking invoice_sent event:', trackingError);
  }
}

// Process invoice input from user messages
export async function processInvoiceInput(message: string, user: any): Promise<{ success: boolean; message: string }> {
  try {
    // Check if user has an ongoing invoice creation by querying user_states directly
    const { data: userState } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', user.id)
      .eq('state_type', 'creating_invoice')
      .single();
    
    if (userState?.state_data) {
      // User has ongoing invoice creation - this should be handled by the bot integration
      return { 
        success: true, 
        message: 'I see you have an ongoing invoice creation. Please continue in the Telegram bot or type "cancel invoice" to start over.' 
      };
    } else {
      // Check if user has a name, if not, ask for it first
      if (!user.name || user.name.trim() === '') {
        // Store the pending invoice message in session context
        await supabase
          .from('sessions')
          .upsert({
            user_id: user.id,
            context: [{
              role: 'system',
              content: JSON.stringify({
                waiting_for: 'name',
                pending_invoice_message: message
              })
            }]
          });
        
        return {
          success: true,
          message: "Before creating an invoice, I need to know your name for the invoice. What's your full name?"
        };
      }
      
      // Start new invoice creation with AI-powered parsing
      const invoiceDetails = parseInvoiceFromMessage(message);
      
      if (invoiceDetails.hasBasicInfo) {
        // Try to create invoice directly if we have enough info
        try {
          // Get user's wallet address - check across all networks
          const { data: wallets } = await supabase
            .from('wallets')
            .select('address, network, chain')
            .eq('user_id', user.id);
          
          if (!wallets || wallets.length === 0) {
            return {
              success: false,
              message: "You need a wallet before creating invoices. Please type 'create wallet' to create your wallet first."
            };
          }
          
          // Find EVM wallet first, fallback to any available wallet
          let wallet = wallets.find(w => w.chain === 'evm' || w.network === 'base');
          if (!wallet) {
            wallet = wallets[0]; // Use first available wallet
          }
          
          const invoiceParams: CreateInvoiceParams = {
            amount: invoiceDetails.amount || 100,
            token: invoiceDetails.token || 'USDC',
            network: invoiceDetails.network || wallet.network || 'base',
            walletAddress: wallet.address,
            userName: user.name,
            description: invoiceDetails.description || 'Professional services',
            recipientEmail: invoiceDetails.email,
            dueDate: invoiceDetails.dueDate,
            userId: user.id
          };
          
          const result = await createInvoice(invoiceParams);
          
          if (result.success) {
            return {
              success: true,
              message: `✅ **Invoice Created Successfully!**\n\n📄 **Invoice Details:**\n• Amount: ${invoiceParams.amount} ${invoiceParams.token}\n• Description: ${invoiceParams.description}\n• Network: ${invoiceParams.network}\n\n🔗 **Invoice Link:**\n${result.invoiceLink}\n\n${invoiceParams.recipientEmail ? '📧 Email sent to client!' : '💡 Share this link with your client to receive payment.'}`
            };
          } else {
            return {
              success: false,
              message: `❌ Failed to create invoice: ${result.error}`
            };
          }
        } catch (error) {
          console.error('Error creating invoice directly:', error);
          return {
            success: false,
            message: 'Failed to create invoice. Please try again or use the step-by-step process in the Telegram bot.'
          };
        }
      } else {
        // Guide user to provide more details
        return {
          success: true,
          message: `I'll help you create an invoice! I need a few more details:\n\n📋 **Required Information:**\n• 💰 **Amount**: How much to charge?\n• 📝 **Description**: What service/product?\n• 📧 **Client Email**: Who should receive this?\n• 📅 **Due Date**: When is payment due?\n\nYou can provide all details in one message like:\n"Create invoice for $500 for website design, send to client@email.com, due in 30 days"\n\nOr I can guide you step-by-step in the Telegram bot by typing "📄 Invoice".`
        };
      }
    }
  } catch (error) {
    console.error('Error processing invoice input:', error);
    return { success: false, message: 'Failed to process invoice request. Please try again.' };
  }
}

// Helper function to parse invoice details from natural language
function parseInvoiceFromMessage(message: string): {
  amount?: number;
  token?: string;
  network?: string;
  description?: string;
  email?: string;
  dueDate?: string;
  hasBasicInfo: boolean;
} {
  const result: any = {};
  
  // Parse amount
  const amountMatch = message.match(/\$?(\d+(?:\.\d{2})?)/);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1]);
  }
  
  // Parse token
  const tokenMatch = message.match(/\b(USDC|ETH|USDT|DAI|WETH|MATIC|ARB|OP)\b/i);
  if (tokenMatch) {
    result.token = tokenMatch[1].toUpperCase();
  }
  
  // Parse email
  const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }
  
  // Parse description (look for common patterns)
  const descriptionPatterns = [
    /for (.+?)(?:\s*,|\s*send|\s*due|\s*$)/i,
    /invoice (.+?)(?:\s*,|\s*send|\s*due|\s*$)/i
  ];
  
  for (const pattern of descriptionPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.description = match[1].trim();
      break;
    }
  }
  
  // Parse due date
  const dueDatePatterns = [
    /due in (\d+) days?/i,
    /due (\d{4}-\d{2}-\d{2})/i,
    /due (.+?)(?:\s*$)/i
  ];
  
  for (const pattern of dueDatePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.dueDate = match[1].trim();
      break;
    }
  }
  
  // Determine if we have basic info
  result.hasBasicInfo = !!(result.amount && (result.description || message.includes('invoice')));
  
  return result;
}