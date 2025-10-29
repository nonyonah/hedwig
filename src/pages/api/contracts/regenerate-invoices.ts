import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contractId } = req.body;

  if (!contractId) {
    return res.status(400).json({ error: 'Contract ID is required' });
  }

  try {
    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if invoices already exist
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('project_contract_id', contractId);

    if (existingInvoices && existingInvoices.length > 0) {
      return res.status(400).json({ 
        error: 'Invoices already exist for this contract',
        invoices: existingInvoices
      });
    }

    // Fetch contract milestones
    const { data: milestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at');

    if (milestonesError) {
      console.error('Error fetching contract milestones:', milestonesError);
    }

    // Generate invoice number
    const generateInvoiceNumber = (): string => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `INV-${year}${month}${day}-${random}`;
    };

    let invoices: any[] = [];

    // If no milestones exist, create a single invoice for the full contract amount
    if (!milestones || milestones.length === 0) {
      console.log('No milestones found, creating single invoice for full amount:', contractId);
      
      const invoiceData = {
        project_contract_id: contractId,
        invoice_number: generateInvoiceNumber(),
        freelancer_name: contract.freelancer_name || 'Freelancer',
        freelancer_email: contract.freelancer_email || '',
        client_name: contract.client_name || 'Client',
        client_email: contract.client_email || '',
        project_description: contract.project_description || contract.project_title || 'Project work',
        quantity: 1,
        rate: contract.total_amount,
        amount: contract.total_amount,
        currency: contract.currency || contract.token_type || 'USDC',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'draft',
        payment_methods: {
          usdc_base: contract.chain === 'base',
          cusd_celo: contract.chain === 'celo'
        },
        user_id: contract.freelancer_id
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert([invoiceData])
        .select()
        .single();

      if (invoiceError) {
        console.error('Error creating single invoice:', invoiceError);
        return res.status(500).json({ error: 'Failed to create invoice', details: invoiceError });
      }

      invoices = [invoice];
    } else {
      // Create invoices for each milestone
      const invoiceInserts = milestones.map((milestone) => ({
        project_contract_id: contractId,
        invoice_number: generateInvoiceNumber(),
        freelancer_name: contract.freelancer_name || 'Freelancer',
        freelancer_email: contract.freelancer_email || '',
        client_name: contract.client_name || 'Client',
        client_email: contract.client_email || '',
        project_description: `${contract.project_title} - ${milestone.title}`,
        quantity: 1,
        rate: milestone.amount,
        amount: milestone.amount,
        currency: contract.currency || contract.token_type || 'USDC',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'draft',
        payment_methods: {
          usdc_base: contract.chain === 'base',
          cusd_celo: contract.chain === 'celo'
        },
        user_id: contract.freelancer_id
      }));

      const { data: createdInvoices, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoiceInserts)
        .select();

      if (invoiceError) {
        console.error('Error creating milestone invoices:', invoiceError);
        return res.status(500).json({ error: 'Failed to create invoices', details: invoiceError });
      }

      invoices = createdInvoices || [];

      // Update milestones with invoice IDs
      if (invoices.length > 0) {
        for (let i = 0; i < invoices.length && i < milestones.length; i++) {
          await supabase
            .from('contract_milestones')
            .update({ invoice_id: invoices[i].id })
            .eq('id', milestones[i].id);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully created ${invoices.length} invoice(s)`,
      contract: {
        id: contract.id,
        title: contract.project_title,
        amount: contract.total_amount,
        currency: contract.currency || contract.token_type
      },
      invoices: invoices,
      milestones: milestones || []
    });

  } catch (error) {
    console.error('Error regenerating invoices:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}