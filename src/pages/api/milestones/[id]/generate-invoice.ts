import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface InvoiceGenerationResponse {
  success: boolean;
  invoice?: any;
  error?: string;
  retryable?: boolean;
  retryAfter?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<InvoiceGenerationResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;
  const { forceRegenerate = false } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
    });
  }

  try {
    // Get milestone details with contract info
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        description,
        amount,
        status,
        payment_status,
        contract_id,
        invoice_id,
        created_at
      `)
      .eq('id', id)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        id,
        title,
        client_id,
        freelancer_id,
        token_type,
        chain,
        status
      `)
      .eq('id', milestone.contract_id)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Check if milestone is approved (required for invoice generation)
    if (milestone.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Milestone must be approved before generating invoice',
        retryable: false
      });
    }

    // Check if invoice already exists and is not paid
    if (milestone.invoice_id && !forceRegenerate) {
      const { data: existingInvoice } = await supabase
        .from('contract_invoices')
        .select('*')
        .eq('id', milestone.invoice_id)
        .single();

      if (existingInvoice && existingInvoice.status !== 'paid') {
        return res.status(200).json({
          success: true,
          invoice: existingInvoice
        });
      }
    }

    // Generate new invoice with retry logic
    const maxRetries = 3;
    let retryCount = 0;
    let invoice = null;

    while (retryCount < maxRetries && !invoice) {
      try {
        const invoiceNumber = generateInvoiceNumber();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

        // Get client and freelancer wallet addresses
        const { data: clientWallet } = await supabase
          .from('auth.users')
          .select('raw_user_meta_data')
          .eq('id', contract.client_id)
          .single();

        const { data: freelancerWallet } = await supabase
          .from('auth.users')
          .select('raw_user_meta_data')
          .eq('id', contract.freelancer_id)
          .single();

        const invoiceData = {
          contract_id: milestone.contract_id,
          milestone_id: milestone.id,
          invoice_number: invoiceNumber,
          amount: milestone.amount,
          token_type: contract.token_type,
          chain: contract.chain,
          token_address: getTokenAddress(contract.token_type, contract.chain),
          client_wallet: clientWallet?.raw_user_meta_data?.wallet_address,
          freelancer_wallet: freelancerWallet?.raw_user_meta_data?.wallet_address,
          status: 'pending',
          due_date: dueDate.toISOString(),
          created_at: new Date().toISOString()
        };

        const { data: newInvoice, error: invoiceError } = await supabase
          .from('contract_invoices')
          .insert(invoiceData)
          .select()
          .single();

        if (invoiceError) {
          throw new Error(`Invoice creation failed: ${invoiceError.message}`);
        }

        invoice = newInvoice;

        // Update milestone with invoice_id
        const { error: updateError } = await supabase
          .from('contract_milestones')
          .update({ 
            invoice_id: invoice.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', milestone.id);

        if (updateError) {
          console.error('Warning: Failed to update milestone with invoice_id:', updateError);
          // Continue anyway as invoice is created
        }

        break; // Success, exit retry loop

      } catch (error) {
        retryCount++;
        console.error(`Invoice generation attempt ${retryCount} failed:`, error);
        
        if (retryCount >= maxRetries) {
          return res.status(500).json({
            success: false,
            error: `Failed to generate invoice after ${maxRetries} attempts`,
            retryable: true,
            retryAfter: 60 // Suggest retry after 60 seconds
          });
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    if (!invoice) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate invoice',
        retryable: true,
        retryAfter: 60
      });
    }

    // Log successful invoice generation
    console.log(`Invoice generated successfully: ${invoice.invoice_number} for milestone: ${milestone.title}`);

    return res.status(200).json({
      success: true,
      invoice
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      retryable: true,
      retryAfter: 60
    });
  }
}

function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  return `INV-${year}${month}${day}-${timestamp}`;
}

function getTokenAddress(tokenType: string, chain: string): string {
  const tokenAddresses: Record<string, Record<string, string>> = {
    'USDC': {
      'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'ethereum': '0xA0b86a33E6441E6C8D3C1C4C9C8C6C8C6C8C6C8C',
      'celo': '0x765DE816845861e75A25fCA122bb6898B8B1282a'
    },
    'ETH': {
      'ethereum': '0x0000000000000000000000000000000000000000',
      'base': '0x4200000000000000000000000000000000000006'
    },
    'cUSD': {
      'celo': '0x765DE816845861e75A25fCA122bb6898B8B1282a'
    }
  };

  return tokenAddresses[tokenType]?.[chain] || '';
}