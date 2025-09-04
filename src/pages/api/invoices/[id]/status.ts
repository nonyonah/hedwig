import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  let { status, transactionHash, senderAddress, chain } = req.body;

  if (status === 'completed') {
    status = 'paid';
  }

  if (!id || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // First, fetch the current invoice to check required fields
    const { data: currentInvoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentInvoice) {
      console.error('Error fetching invoice:', fetchError);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Prepare update data
    const updateData: any = {
      status: status, // Keep the original status ('paid' is valid for invoices)
      payment_transaction: transactionHash,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    // If updating to 'completed' status, ensure all required fields are populated
    if (status === 'paid') {
      // Check and populate required fields for non-draft invoices
      if (!currentInvoice.deliverables) {
        updateData.deliverables = currentInvoice.project_description || 'Payment completed via blockchain transaction';
      }
      if (!currentInvoice.project_description) {
        updateData.project_description = 'Blockchain payment processing';
      }
      if (!currentInvoice.freelancer_name || !currentInvoice.freelancer_email) {
        // Fetch user's actual name and email instead of using placeholders
        const { data: userData } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', currentInvoice.user_id)
          .single();
        
        if (!currentInvoice.freelancer_name) {
          updateData.freelancer_name = userData?.name || 'Freelancer';
        }
        if (!currentInvoice.freelancer_email) {
          updateData.freelancer_email = userData?.email || 'freelancer@hedwig.com';
        }
      }
      if (!currentInvoice.client_name) {
        updateData.client_name = 'Client';
      }
      if (!currentInvoice.client_email) {
        updateData.client_email = 'client@hedwig.com';
      }
      if (!currentInvoice.wallet_address) {
        // Fetch user's actual wallet address instead of using zero address
        const { data: wallets } = await supabase
          .from('wallets')
          .select('address, chain')
          .eq('user_id', currentInvoice.created_by);
        
        if (wallets && wallets.length > 0) {
          const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
          updateData.wallet_address = evmWallet?.address || wallets[0]?.address || null;
        } else {
          updateData.wallet_address = null;
        }
      }
      if (!currentInvoice.blockchain) {
        updateData.blockchain = 'base';
      }
      if (currentInvoice.price === null || currentInvoice.price === undefined) {
        updateData.price = currentInvoice.amount || 0;
      }
      if (currentInvoice.amount === null || currentInvoice.amount === undefined) {
        updateData.amount = currentInvoice.price || 0;
      }
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating invoice status:', error);
      return res.status(500).json({ error: 'Failed to update invoice status' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Send Telegram notification if status is paid and transactionHash is provided
    if (status === 'paid' && transactionHash) {
      try {
        // Use localhost for development if NEXT_PUBLIC_BASE_URL is not set or unreachable
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        
        await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'invoice',
            id: id,
            amount: data[0].total || data[0].subtotal,
            currency: data[0].currency || 'USDC',
            transactionHash,
            status: 'paid',
            payerWallet: senderAddress || 'unknown',
            chain: chain || 'base',
            recipientUserId: data[0].created_by,
            freelancerName: data[0].freelancer_name,
            clientName: data[0].client_name
          }),
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(5000)
        });
        console.log('Telegram notification sent successfully');
      } catch (notificationError) {
        console.error('Failed to send Telegram notification:', notificationError);
        // Don't fail the status update if notification fails - this is non-critical
      }
    }

    res.status(200).json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error in invoice status update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}