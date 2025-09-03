import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Paycrest webhook payload types
interface PaycrestWebhookPayload {
  orderId: string;
  status: 'initiated' | 'pending' | 'processing' | 'validated' | 'settled' | 'cancelled' | 'expired' | 'failed';
  transactionHash?: string;
  liquidityProvider?: string;
  timestamp: string;
  data?: any;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload: PaycrestWebhookPayload = req.body;
    
    console.log('[Webhook] Received Paycrest webhook:', payload);

    // Validate webhook payload
    if (!payload.orderId || !payload.status) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Update transaction status in database
    const { data: transaction, error: fetchError } = await supabase
      .from('offramp_transactions')
      .select('*')
      .eq('order_id', payload.orderId)
      .single();

    if (fetchError || !transaction) {
      console.error('[Webhook] Transaction not found:', payload.orderId);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Map Paycrest status to our internal status
    const statusMapping: Record<string, string> = {
      'initiated': 'pending',
      'pending': 'pending', 
      'processing': 'processing',
      'validated': 'processing',
      'settled': 'completed',
      'cancelled': 'failed',
      'expired': 'failed',
      'failed': 'failed'
    };

    const newStatus = statusMapping[payload.status] || 'pending';

    // Update transaction
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    if (payload.transactionHash) {
      updateData.tx_hash = payload.transactionHash;
    }

    const { error: updateError } = await supabase
      .from('offramp_transactions')
      .update(updateData)
      .eq('id', transaction.id);

    if (updateError) {
      console.error('[Webhook] Failed to update transaction:', updateError);
      return res.status(500).json({ error: 'Failed to update transaction' });
    }

    console.log(`[Webhook] Updated transaction ${transaction.id} status to ${newStatus}`);

    // Send notification to user if needed
    if (newStatus === 'completed' || newStatus === 'failed') {
      // TODO: Implement user notification (email, push, etc.)
      console.log(`[Webhook] Transaction ${transaction.id} ${newStatus}`);
    }

    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    console.error('[Webhook] Error processing webhook:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}