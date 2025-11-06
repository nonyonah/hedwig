import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PaymentInitiationResponse {
  success: boolean;
  redirectUrl?: string;
  invoiceId?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PaymentInitiationResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
    });
  }

  try {
    // Get milestone details
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        amount,
        status,
        payment_status,
        contract_id,
        invoice_id
      `)
      .eq('id', id)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    // Validate milestone is approved
    if (milestone.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Milestone must be approved before payment can be initiated'
      });
    }

    // Check if already paid
    if (milestone.payment_status === 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Milestone has already been paid'
      });
    }

    // Check if invoice exists, if not generate one
    let invoiceId = milestone.invoice_id;
    
    if (!invoiceId) {
      // Generate invoice for this milestone
      const generateResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/milestones/${id}/generate-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (generateResponse.ok) {
        const generateResult = await generateResponse.json();
        if (generateResult.success && generateResult.invoice) {
          invoiceId = generateResult.invoice.id;
        }
      }
    }

    if (!invoiceId) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate invoice for payment'
      });
    }

    // Update milestone payment status to processing
    await supabase
      .from('contract_milestones')
      .update({ 
        payment_status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    // Generate redirect URL to invoice page
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz';
    const redirectUrl = `${baseUrl}/invoice/${invoiceId}?contract=${milestone.contract_id}&milestone=${id}`;

    return res.status(200).json({
      success: true,
      redirectUrl,
      invoiceId
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}