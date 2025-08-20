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

  try {
    const { paymentLinkId, proposalId, invoiceId } = req.body as {
      paymentLinkId?: string;
      proposalId?: string;
      invoiceId?: string;
    };

    if (!paymentLinkId) {
      return res.status(400).json({ error: 'Payment link ID is required' });
    }

    if (!proposalId && !invoiceId) {
      return res.status(400).json({ error: 'Either proposal ID or invoice ID is required' });
    }

    if (proposalId && invoiceId) {
      return res.status(400).json({ error: 'Cannot link to both proposal and invoice' });
    }

    // Check if payment link exists and is not already linked
    const { data: existingLink, error: fetchError } = await supabase
      .from('payment_links')
      .select('id, proposal_id, invoice_id, status')
      .eq('id', paymentLinkId)
      .single();

    if (fetchError) {
      console.error('Error fetching payment link:', fetchError);
      return res.status(404).json({ error: 'Payment link not found' });
    }

    if (existingLink.proposal_id || existingLink.invoice_id) {
      return res.status(400).json({ 
        error: 'Payment link is already linked to another proposal or invoice' 
      });
    }

    if (existingLink.status === 'paid') {
      return res.status(400).json({ 
        error: 'Cannot link a payment link that has already been paid' 
      });
    }

    // Verify that the proposal or invoice exists
    if (proposalId) {
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('id, status')
        .eq('id', proposalId)
        .single();

      if (proposalError) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      if (proposal.status === 'completed' || proposal.status === 'paid') {
        return res.status(400).json({ 
          error: 'Cannot link to a proposal that has already been completed or paid' 
        });
      }
    }

    if (invoiceId) {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, status')
        .eq('id', invoiceId)
        .single();

      if (invoiceError) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.status === 'paid') {
        return res.status(400).json({ 
          error: 'Cannot link to an invoice that has already been paid' 
        });
      }
    }

    // Update the payment link with the proposal or invoice ID
    const updateData: any = {};
    if (proposalId) {
      updateData.proposal_id = proposalId;
    }
    if (invoiceId) {
      updateData.invoice_id = invoiceId;
    }

    const { data, error } = await supabase
      .from('payment_links')
      .update(updateData)
      .eq('id', paymentLinkId)
      .select()
      .single();

    if (error) {
      console.error('Error linking payment to proposal/invoice:', error);
      return res.status(500).json({ error: 'Failed to link payment to proposal/invoice' });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Payment link successfully linked to ${proposalId ? 'proposal' : 'invoice'}`,
      data 
    });
  } catch (error) {
    console.error('Error in link-payment-to-proposal:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}