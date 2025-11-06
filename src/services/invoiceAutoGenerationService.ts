import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AutoInvoiceResult {
  success: boolean;
  invoice?: any;
  error?: string;
  retryable?: boolean;
}

/**
 * Automatically generates an invoice when a milestone is approved
 * This function is called as part of the milestone approval workflow
 */
export async function autoGenerateInvoiceOnApproval(
  milestoneId: string,
  contractId: string
): Promise<AutoInvoiceResult> {
  try {
    // Get milestone details
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('id', milestoneId)
      .single();

    if (milestoneError || !milestone) {
      return {
        success: false,
        error: 'Milestone not found',
        retryable: false
      };
    }

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return {
        success: false,
        error: 'Contract not found',
        retryable: false
      };
    }

    // Check if invoice already exists
    if (milestone.invoice_id) {
      const { data: existingInvoice } = await supabase
        .from('contract_invoices')
        .select('*')
        .eq('id', milestone.invoice_id)
        .single();

      if (existingInvoice && existingInvoice.status !== 'paid') {
        return {
          success: true,
          invoice: existingInvoice
        };
      }
    }

    // Generate invoice
    const invoiceResult = await generateInvoiceForMilestone(milestone, contract);
    
    if (!invoiceResult.success) {
      return invoiceResult;
    }

    // Update milestone with invoice_id
    const { error: updateError } = await supabase
      .from('contract_milestones')
      .update({ 
        invoice_id: invoiceResult.invoice.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', milestoneId);

    if (updateError) {
      console.error('Warning: Failed to link invoice to milestone:', updateError);
      // Continue anyway as invoice is created
    }

    return invoiceResult;

  } catch (error) {
    console.error('Error in auto invoice generation:', error);
    return {
      success: false,
      error: 'Internal error during invoice generation',
      retryable: true
    };
  }
}

/**
 * Generates an invoice for a specific milestone
 */
async function generateInvoiceForMilestone(
  milestone: any,
  contract: any
): Promise<AutoInvoiceResult> {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const invoiceNumber = generateInvoiceNumber();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      // Get wallet addresses
      const walletAddresses = await getWalletAddresses(contract.client_id, contract.freelancer_id);

      const invoiceData = {
        contract_id: milestone.contract_id,
        milestone_id: milestone.id,
        invoice_number: invoiceNumber,
        amount: milestone.amount,
        token_type: contract.token_type,
        chain: contract.chain,
        token_address: getTokenAddress(contract.token_type, contract.chain),
        client_wallet: walletAddresses.clientWallet,
        freelancer_wallet: walletAddresses.freelancerWallet,
        status: 'pending',
        due_date: dueDate.toISOString(),
        created_at: new Date().toISOString()
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from('contract_invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) {
        throw new Error(`Invoice creation failed: ${invoiceError.message}`);
      }

      console.log(`Auto-generated invoice ${invoice.invoice_number} for milestone: ${milestone.title}`);

      return {
        success: true,
        invoice
      };

    } catch (error) {
      retryCount++;
      console.error(`Invoice generation attempt ${retryCount} failed:`, error);
      
      if (retryCount >= maxRetries) {
        return {
          success: false,
          error: `Failed to generate invoice after ${maxRetries} attempts`,
          retryable: true
        };
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
    }
  }

  return {
    success: false,
    error: 'Failed to generate invoice',
    retryable: true
  };
}

/**
 * Gets wallet addresses for client and freelancer
 */
async function getWalletAddresses(clientId: string, freelancerId: string) {
  const { data: clientData } = await supabase
    .from('auth.users')
    .select('raw_user_meta_data')
    .eq('id', clientId)
    .single();

  const { data: freelancerData } = await supabase
    .from('auth.users')
    .select('raw_user_meta_data')
    .eq('id', freelancerId)
    .single();

  return {
    clientWallet: clientData?.raw_user_meta_data?.wallet_address,
    freelancerWallet: freelancerData?.raw_user_meta_data?.wallet_address
  };
}

/**
 * Generates a unique invoice number
 */
function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const timestamp = Date.now().toString().slice(-6);
  return `INV-${year}${month}${day}-${timestamp}`;
}

/**
 * Gets token contract address based on token type and chain
 */
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

/**
 * Batch generates invoices for multiple milestones
 * Useful for bulk operations
 */
export async function batchGenerateInvoices(
  milestoneIds: string[],
  contractId: string
): Promise<{ success: boolean; results: AutoInvoiceResult[]; errors: string[] }> {
  const results: AutoInvoiceResult[] = [];
  const errors: string[] = [];

  for (const milestoneId of milestoneIds) {
    try {
      const result = await autoGenerateInvoiceOnApproval(milestoneId, contractId);
      results.push(result);
      
      if (!result.success) {
        errors.push(`Milestone ${milestoneId}: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = `Milestone ${milestoneId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      results.push({
        success: false,
        error: errorMsg,
        retryable: true
      });
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors
  };
}