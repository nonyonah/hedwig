import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { projectNotificationService, NotificationData } from '../../../../services/projectNotificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface InvoiceResponse {
  success: boolean;
  message?: string;
  invoice?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<InvoiceResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;
  const { transactionHash, paymentAmount } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invoice ID is required'
    });
  }

  try {
    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from('contract_invoices')
      .select(`
        id,
        title,
        amount,
        currency,
        status,
        contract_id,
        freelancer_id,
        client_email,
        client_name,
        contracts!contract_invoices_contract_id_fkey (
          title,
          users!contracts_freelancer_id_fkey (
            email,
            first_name,
            last_name
          )
        )
      `)
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Invoice is already paid'
      });
    }

    // Update invoice status to paid
    const updateData: any = {
      status: 'paid',
      paid_at: new Date().toISOString()
    };

    if (transactionHash) {
      updateData.transaction_hash = transactionHash;
    }

    if (paymentAmount) {
      updateData.paid_amount = paymentAmount;
    }

    const { data: updatedInvoice, error: updateError } = await supabase
      .from('contract_invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating invoice status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to mark invoice as paid'
      });
    }

    // Update milestone payment status if this invoice is linked to a milestone
    if (invoice.contract_id) {
      console.log('[Mark Paid] Invoice paid, checking for linked milestone');
      
      // Check if this is a milestone invoice by looking at the title
      const { data: milestones } = await supabase
        .from('contract_milestones')
        .select('id, title, payment_status')
        .eq('contract_id', invoice.contract_id)
        .eq('status', 'approved')
        .in('payment_status', ['unpaid', 'processing']);
      
      if (milestones && milestones.length > 0) {
        const invoiceTitle = invoice.title || '';
        const matchedMilestone = milestones.find(m => 
          invoiceTitle.toLowerCase().includes(m.title.toLowerCase())
        );
        
        if (matchedMilestone) {
          console.log('[Mark Paid] Updating milestone payment status:', matchedMilestone.id);
          
          await supabase
            .from('contract_milestones')
            .update({
              payment_status: 'paid',
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedMilestone.id);
        }
      }
    }

    // Send notifications
    try {
      const contract = Array.isArray(invoice.contracts) ? invoice.contracts[0] : invoice.contracts;
      const users = contract?.users;
      const user = Array.isArray(users) ? users[0] : users;
      const notificationData: NotificationData = {
        contractId: invoice.contract_id,
        projectTitle: contract?.title || invoice.title,
        freelancerId: invoice.freelancer_id,
        freelancerName: `${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
        freelancerEmail: user?.email,
        clientName: invoice.client_name,
        clientEmail: invoice.client_email,
        amount: paymentAmount || invoice.amount,
        currency: invoice.currency || 'USD',
        invoiceId: invoice.id
      };

      await projectNotificationService.sendInvoicePayment(notificationData);
    } catch (notificationError) {
      console.error('Failed to send invoice payment notifications:', notificationError);
      // Don't fail the payment marking if notifications fail
    }

    return res.status(200).json({
      success: true,
      message: 'Invoice marked as paid successfully',
      invoice: updatedInvoice
    });

  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}