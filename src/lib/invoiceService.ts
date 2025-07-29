import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    items
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
    const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism-sepolia', 'celo-alfajores'];
    
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
        price: amount,
        amount: amount,
        wallet_address: walletAddress.toLowerCase(),
        blockchain: network.toLowerCase(),
        status: 'draft',
        due_date: dueDate || null,
        additional_notes: items ? JSON.stringify(items) : null
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const invoiceLink = `${baseUrl}/invoice/${data.id}`;

    // TODO: Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        // Email sending logic would go here
        console.log(`Invoice email would be sent to ${recipientEmail} for invoice ${invoiceLink}`);
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