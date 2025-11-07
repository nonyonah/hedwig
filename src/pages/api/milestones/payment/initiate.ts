import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { PaymentRequest, PaymentResponse, PaymentError, ContractMilestone } from '../../../../types/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PaymentResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      invoiceIds: []
    });
  }

  const { milestoneIds, contractId, paymentType = 'single' }: PaymentRequest = req.body;

  // Validation
  if (!milestoneIds || !Array.isArray(milestoneIds) || milestoneIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Milestone IDs are required and must be a non-empty array',
      invoiceIds: []
    });
  }

  if (!contractId) {
    return res.status(400).json({
      success: false,
      error: 'Contract ID is required',
      invoiceIds: []
    });
  }

  try {
    // Verify contract exists and get contract details
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
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found',
        invoiceIds: []
      });
    }

    // Get milestones with validation
    const { data: milestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .select('*')
      .in('id', milestoneIds)
      .eq('contract_id', contractId);

    if (milestonesError) {
      console.error('Error fetching milestones:', milestonesError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch milestones',
        invoiceIds: []
      });
    }

    if (!milestones || milestones.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No milestones found for the provided IDs',
        invoiceIds: []
      });
    }

    // Validate milestone ownership and status
    const invalidMilestones = milestones.filter(m => m.contract_id !== contractId);
    if (invalidMilestones.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Some milestones do not belong to the specified contract',
        invoiceIds: []
      });
    }

    // Check milestone approval status
    const unapprovedMilestones = milestones.filter(m => m.status !== 'approved');
    if (unapprovedMilestones.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Milestones must be approved before payment. Unapproved: ${unapprovedMilestones.map(m => m.title).join(', ')}`,
        invoiceIds: []
      });
    }

    // Check if already paid
    const alreadyPaidMilestones = milestones.filter(m => m.payment_status === 'paid');
    if (alreadyPaidMilestones.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Some milestones are already paid: ${alreadyPaidMilestones.map(m => m.title).join(', ')}`,
        invoiceIds: []
      });
    }

    // Calculate total amount
    const totalAmount = milestones.reduce((sum, milestone) => sum + Number(milestone.amount), 0);

    // Check for existing invoices or create new ones
    const invoiceIds: string[] = [];
    const createdInvoices: any[] = [];

    for (const milestone of milestones) {
      let invoice: any = null;

      // Check if invoice already exists for this milestone
      if (milestone.invoice_id) {
        const { data: existingInvoice } = await supabase
          .from('contract_invoices')
          .select('*')
          .eq('id', milestone.invoice_id)
          .single();

        if (existingInvoice && existingInvoice.status !== 'paid') {
          invoice = existingInvoice;
        }
      }

      // Create new invoice if none exists or existing one is paid
      if (!invoice) {
        const invoiceNumber = generateInvoiceNumber();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

        const { data: newInvoice, error: invoiceError } = await supabase
          .from('contract_invoices')
          .insert({
            contract_id: contractId,
            milestone_id: milestone.id,
            invoice_number: invoiceNumber,
            amount: milestone.amount,
            token_type: contract.token_type,
            chain: contract.chain,
            status: 'pending',
            due_date: dueDate.toISOString(),
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('Error creating invoice for milestone:', milestone.id, invoiceError);
          return res.status(500).json({
            success: false,
            error: `Failed to create invoice for milestone: ${milestone.title}`,
            invoiceIds: []
          });
        }

        invoice = newInvoice;

        // Update milestone with invoice_id
        if (invoice) {
          await supabase
            .from('contract_milestones')
            .update({ invoice_id: invoice.id })
            .eq('id', milestone.id);
        }
      }

      if (invoice) {
        invoiceIds.push(invoice.id);
        createdInvoices.push(invoice);
      }
    }

    // Update milestone payment status to processing
    const { error: updateError } = await supabase
      .from('contract_milestones')
      .update({ 
        payment_status: 'processing',
        updated_at: new Date().toISOString()
      })
      .in('id', milestoneIds);

    if (updateError) {
      console.error('Error updating milestone payment status:', updateError);
      // Continue anyway as invoices are created
    }

    // Generate redirect URL for payment interface
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz';
    const redirectUrl = paymentType === 'bulk' 
      ? `${baseUrl}/payment/bulk?invoices=${invoiceIds.join(',')}&contract=${contractId}`
      : `${baseUrl}/payment/${invoiceIds[0]}?contract=${contractId}`;

    return res.status(200).json({
      success: true,
      invoiceIds,
      redirectUrl,
      paymentSummary: {
        totalAmount,
        currency: contract.token_type,
        milestoneCount: milestones.length
      }
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      invoiceIds: []
    });
  }
}

function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}${day}-${random}`;
}