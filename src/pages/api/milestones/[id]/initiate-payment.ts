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
  message?: string;
  alreadyPaid?: boolean;
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
    console.log('[Initiate Payment] Starting payment initiation for milestone:', id);
    
    // Get milestone details (invoice_id might not exist yet in DB)
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        amount,
        status,
        payment_status,
        contract_id
      `)
      .eq('id', id)
      .single();

    if (milestoneError || !milestone) {
      console.error('[Initiate Payment] Milestone not found:', milestoneError);
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    console.log('[Initiate Payment] Milestone found:', {
      id: milestone.id,
      title: milestone.title,
      status: milestone.status,
      payment_status: milestone.payment_status
    });

    // Validate milestone is approved
    if (milestone.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Milestone must be approved before payment can be initiated'
      });
    }

    // Check if already paid - find the paid invoice and redirect to it
    if (milestone.payment_status === 'paid') {
      console.log('[Initiate Payment] Milestone already paid, looking for paid invoice');
      
      // Try to find the paid invoice for this milestone
      const { data: paidInvoices } = await supabase
        .from('invoices')
        .select('id, status')
        .eq('project_contract_id', milestone.contract_id)
        .ilike('project_description', `%${milestone.title}%`)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(1);
      
      if (paidInvoices && paidInvoices.length > 0) {
        console.log('[Initiate Payment] Found paid invoice, redirecting:', paidInvoices[0].id);
        return res.status(200).json({
          success: true,
          message: 'Milestone already paid',
          invoiceId: paidInvoices[0].id,
          redirectUrl: `/invoice/${paidInvoices[0].id}`,
          alreadyPaid: true
        });
      }
      
      // If no invoice found but milestone is marked as paid, just return error
      return res.status(400).json({
        success: false,
        error: 'Milestone has already been paid'
      });
    }

    // If payment_status is 'processing', allow re-initiation (user may have deleted invoice)
    if (milestone.payment_status === 'processing') {
      console.log('[Initiate Payment] Milestone already in processing state, will create new invoice');
    }

    // Get contract details (freelancer_wallet column may not exist)
    console.log('[Initiate Payment] Fetching contract:', milestone.contract_id);
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select(`
        id,
        project_title,
        freelancer_id,
        client_id,
        client_email,
        currency,
        token_type
      `)
      .eq('id', milestone.contract_id)
      .single();

    if (contractError || !contract) {
      console.error('[Initiate Payment] Contract not found:', {
        contract_id: milestone.contract_id,
        error: contractError
      });
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    console.log('[Initiate Payment] Contract found:', {
      id: contract.id,
      title: contract.project_title,
      freelancer_id: contract.freelancer_id
    });

    // Get freelancer details (wallet and name)
    let freelancerWallet = null;
    let freelancerName = 'Freelancer';
    let freelancerEmail = 'freelancer@hedwigbot.xyz'; // Default email to satisfy constraint
    
    if (contract.freelancer_id) {
      // Get freelancer user details (try common column name variations)
      const { data: freelancerUser, error: freelancerError } = await supabase
        .from('users')
        .select('username, name, email')
        .eq('id', contract.freelancer_id)
        .single();
      
      if (freelancerError) {
        console.error('[Initiate Payment] Error fetching freelancer:', freelancerError);
      }
      
      if (freelancerUser) {
        freelancerEmail = freelancerUser.email || 'freelancer@hedwigbot.xyz';
        // Use username or name field
        freelancerName = freelancerUser.username || freelancerUser.name || 'Freelancer';
        
        console.log('[Initiate Payment] Freelancer details:', {
          name: freelancerName,
          email: freelancerEmail
        });
      }
      
      // Get wallet from wallets table
      const { data: wallets } = await supabase
        .from('wallets')
        .select('address, chain')
        .eq('user_id', contract.freelancer_id)
        .order('created_at', { ascending: true });

      if (wallets && wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
        freelancerWallet = evmWallet?.address || wallets[0]?.address || null;
        console.log('[Initiate Payment] Found wallet in wallets table:', freelancerWallet);
      }
    }

    if (!freelancerWallet) {
      return res.status(400).json({
        success: false,
        error: 'Freelancer wallet address not found. Please ask the freelancer to connect their wallet.'
      });
    }

    // Get client details
    let clientName = 'Client';
    let clientEmail = contract.client_email || 'client@hedwigbot.xyz'; // Default email
    
    if (contract.client_id) {
      const { data: clientUser, error: clientError } = await supabase
        .from('users')
        .select('username, name, email')
        .eq('id', contract.client_id)
        .single();
      
      if (clientError) {
        console.error('[Initiate Payment] Error fetching client:', clientError);
      }
      
      if (clientUser) {
        clientEmail = clientUser.email || contract.client_email || 'client@hedwigbot.xyz';
        clientName = clientUser.username || clientUser.name || 'Client';
        console.log('[Initiate Payment] Client details:', {
          name: clientName,
          email: clientEmail
        });
      }
    }
    
    console.log('[Initiate Payment] Invoice parties:', {
      freelancer: freelancerName,
      client: clientName
    });

    // Check if invoice already exists for this milestone
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('project_contract_id', contract.id)
      .ilike('project_description', `%${milestone.title}%`)
      .in('status', ['draft', 'sent']) // Only look for unpaid invoices
      .order('date_created', { ascending: false })
      .limit(1);

    let invoiceId = existingInvoices && existingInvoices.length > 0 ? existingInvoices[0].id : null;
    
    if (invoiceId) {
      console.log('[Initiate Payment] Found existing invoice:', invoiceId);
    }
    
    if (!invoiceId) {
      console.log('[Initiate Payment] No existing invoice found, creating new one');
      
      // If milestone is in 'processing' state but no invoice exists, reset to 'unpaid'
      if (milestone.payment_status === 'processing') {
        console.log('[Initiate Payment] Resetting payment_status from processing to unpaid');
        await supabase
          .from('contract_milestones')
          .update({ 
            payment_status: 'unpaid',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
      }
      // Generate invoice for this milestone using the invoices table
      const invoiceNumber = `INV-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      console.log('[Initiate Payment] Creating invoice with wallet:', freelancerWallet);
      
      const { data: newInvoice, error: createInvoiceError } = await supabase
        .from('invoices')
        .insert({
          freelancer_name: freelancerName,
          freelancer_email: freelancerEmail,
          wallet_address: freelancerWallet, // Use wallet_address field (not freelancer_wallet)
          client_name: clientName,
          client_email: clientEmail,
          date_created: new Date().toISOString(),
          project_description: `${contract.project_title} - ${milestone.title}`,
          amount: milestone.amount,
          currency: contract.currency || contract.token_type || 'USDC',
          status: 'draft', // Use 'draft' to avoid constraint, will be updated to 'sent' when viewed
          invoice_number: invoiceNumber,
          due_date: dueDate.toISOString().split('T')[0],
          additional_notes: `Payment for milestone: ${milestone.title}`,
          project_contract_id: contract.id,
          user_id: contract.freelancer_id,
          payment_methods: {
            cusd_celo: false,
            usdc_base: true
          },
          quantity: 1,
          rate: milestone.amount
        })
        .select()
        .single();

      if (createInvoiceError || !newInvoice) {
        console.error('Error creating invoice:', createInvoiceError);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate invoice for payment'
        });
      }

      invoiceId = newInvoice.id;
      console.log('[Initiate Payment] Invoice created:', invoiceId);

      // Try to update milestone with invoice_id (column might not exist yet)
      try {
        await supabase
          .from('contract_milestones')
          .update({ 
            invoice_id: invoiceId,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
      } catch (updateError) {
        console.warn('[Initiate Payment] Could not update milestone with invoice_id (column may not exist):', updateError);
        // Continue anyway - invoice is created
      }
    } else {
      console.log('[Initiate Payment] Using existing invoice:', invoiceId);
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

    console.log('[Initiate Payment] Payment initiation successful, redirecting to:', redirectUrl);

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