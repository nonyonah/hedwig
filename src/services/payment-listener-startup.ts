import { HedwigPaymentService } from '../contracts/HedwigPaymentService';
import { createClient } from '@supabase/supabase-js';
import { PaymentReceivedEvent } from '../contracts/types';

// Environment variables
const CONTRACT_ADDRESS = process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS || process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET;
const RPC_URL = process.env.BASE_RPC_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let isListenerRunning = false;
let paymentService: HedwigPaymentService | null = null;
let supabase: any = null;

/**
 * Initialize and start the payment event listener
 */
export async function startPaymentListener(): Promise<boolean> {
  if (isListenerRunning) {
    console.log('Payment listener is already running');
    return true;
  }

  try {
    // Validate environment variables
    if (!CONTRACT_ADDRESS) {
      throw new Error('HEDWIG_PAYMENT_CONTRACT_ADDRESS or HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET must be set');
    }
    if (!RPC_URL) {
      throw new Error('BASE_RPC_URL must be set');
    }
    if (!SUPABASE_URL) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL must be set');
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    console.log('Initializing payment listener service...');
    console.log('Contract Address:', CONTRACT_ADDRESS);
    console.log('RPC URL:', RPC_URL);

    // Initialize services
    paymentService = new HedwigPaymentService(CONTRACT_ADDRESS, RPC_URL);
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Start listening for payment events
    await paymentService.listenForPayments(async (event: PaymentReceivedEvent) => {
      console.log('Payment received:', event);
      await processPaymentEvent(event);
    });

    isListenerRunning = true;
    console.log('✅ Payment event listener started successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to start payment listener:', error);
    return false;
  }
}

/**
 * Process a payment event and update database
 */
async function processPaymentEvent(event: PaymentReceivedEvent): Promise<void> {
  try {
    console.log('🔄 Processing payment event:', {
      transactionHash: event.transactionHash,
      invoiceId: event.invoiceId,
      amount: event.amount.toString(),
      payer: event.payer,
      freelancer: event.freelancer
    });

    // Check if this event has already been processed
    const { data: existingEvent } = await supabase
      .from('payment_events')
      .select('id, processed')
      .eq('transaction_hash', event.transactionHash)
      .eq('invoice_id', event.invoiceId)
      .single();

    if (existingEvent) {
      if (existingEvent.processed) {
        console.log('⏭️ Payment event already processed, skipping:', event.transactionHash);
        return;
      } else {
        console.log('🔄 Payment event exists but not processed, continuing...');
      }
    }

    // Store payment event in database
    const { error: dbError } = await supabase
      .from('payment_events')
      .upsert({
        transaction_hash: event.transactionHash,
        payer: event.payer,
        freelancer: event.freelancer,
        amount: event.amount.toString(),
        fee: event.fee.toString(),
        token: event.token,
        invoice_id: event.invoiceId,
        block_number: event.blockNumber,
        timestamp: new Date(event.timestamp * 1000).toISOString(),
        processed: false
      }, {
        onConflict: 'transaction_hash,invoice_id'
      });

    if (dbError) {
      console.error('❌ Error storing payment event:', dbError);
      return;
    }

    // Update invoice/proposal/payment_link status based on invoiceId format
    if (event.invoiceId.startsWith('invoice_')) {
      const invoiceId = event.invoiceId.replace('invoice_', '');
      
      // First fetch current invoice to check required fields
      const { data: currentInvoice, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (fetchError) {
        console.error('❌ Error fetching invoice:', fetchError);
        return;
      }

      if (!currentInvoice) {
        console.error('❌ Invoice not found:', invoiceId);
        return;
      }

      if (currentInvoice.status === 'paid') {
        console.log('⏭️ Invoice already paid, skipping update:', invoiceId);
        // Still send notification in case it was missed
        await sendPaymentNotification('invoice', invoiceId, event);
        return;
      }

      const updateData: any = {
        status: 'paid',
        paid_at: new Date(event.timestamp * 1000).toISOString(),
        payment_transaction: event.transactionHash
      };

      // Ensure all required fields are populated for non-draft invoices
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
          .eq('id', currentInvoice.user_id || currentInvoice.created_by)
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
          .eq('user_id', currentInvoice.created_by || currentInvoice.user_id);
        
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

      const { error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (updateError) {
        console.error('❌ Error updating invoice:', updateError);
        return;
      }
      
      console.log(`✅ Updated invoice ${invoiceId} status to paid`);
      
      // Send payment notification
      await sendPaymentNotification('invoice', invoiceId, event);
    } else if (event.invoiceId.startsWith('proposal_')) {
      const proposalId = event.invoiceId.replace('proposal_', '');
      
      // Check if proposal exists and is not already paid
      const { data: currentProposal, error: fetchError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (fetchError) {
        console.error('❌ Error fetching proposal:', fetchError);
        return;
      }

      if (!currentProposal) {
        console.error('❌ Proposal not found:', proposalId);
        return;
      }

      if (currentProposal.status === 'paid') {
        console.log('⏭️ Proposal already paid, skipping update:', proposalId);
        await sendPaymentNotification('proposal', proposalId, event);
        return;
      }

      const { error: updateError } = await supabase
        .from('proposals')
        .update({ 
          status: 'paid',
          paid_at: new Date(event.timestamp * 1000).toISOString(),
          payment_transaction: event.transactionHash
        })
        .eq('id', proposalId);

      if (updateError) {
        console.error('❌ Error updating proposal:', updateError);
        return;
      }
      
      console.log(`✅ Updated proposal ${proposalId} status to paid`);
      
      // Send payment notification
      await sendPaymentNotification('proposal', proposalId, event);
    } else {
      // Check if it's a payment link UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(event.invoiceId)) {
        // Check if payment link exists and is not already paid
        const { data: currentPaymentLink, error: fetchError } = await supabase
          .from('payment_links')
          .select('*')
          .eq('id', event.invoiceId)
          .single();

        if (fetchError) {
          console.error('❌ Error fetching payment link:', fetchError);
          return;
        }

        if (!currentPaymentLink) {
          console.error('❌ Payment link not found:', event.invoiceId);
          return;
        }

        if (currentPaymentLink.status === 'paid') {
          console.log('⏭️ Payment link already paid, skipping update:', event.invoiceId);
          await sendPaymentNotification('payment_link', event.invoiceId, event);
          return;
        }

        const { error: paymentLinkError } = await supabase
          .from('payment_links')
          .update({ 
            status: 'paid',
            paid_at: new Date(event.timestamp * 1000).toISOString(),
            transaction_hash: event.transactionHash,
            paid_amount: parseFloat(event.amount.toString()) / 1000000 // Convert from wei to USDC (6 decimals)
          })
          .eq('id', event.invoiceId);
        
        if (paymentLinkError) {
          console.error('❌ Error updating payment link:', paymentLinkError);
          return;
        }
        
        console.log(`✅ Updated payment link ${event.invoiceId} status to paid`);
        
        // Send payment notification
        await sendPaymentNotification('payment_link', event.invoiceId, event);
      } else {
        console.warn('⚠️ Unknown invoice ID format:', event.invoiceId);
      }
    }

    // Mark event as processed
    await supabase
      .from('payment_events')
      .update({ processed: true })
      .eq('transaction_hash', event.transactionHash)
      .eq('invoice_id', event.invoiceId);

    console.log('✅ Payment event processed successfully');
  } catch (processingError) {
    console.error('❌ Error processing payment event:', processingError);
    
    // Mark event as failed for debugging
    try {
      await supabase
        .from('payment_events')
        .update({ 
          processed: false,
          error_message: processingError instanceof Error ? processingError.message : 'Unknown error'
        })
        .eq('transaction_hash', event.transactionHash)
        .eq('invoice_id', event.invoiceId);
    } catch (markError) {
      console.error('❌ Error marking event as failed:', markError);
    }
  }
}

/**
 * Send payment notification via webhook
 */
async function sendPaymentNotification(
  type: 'invoice' | 'proposal' | 'payment_link',
  itemId: string,
  event: PaymentReceivedEvent
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Fetch item data for notification
    let itemData;
    let recipientUserId;
    
    if (type === 'invoice') {
      const { data } = await supabase
        .from('invoices')
        .select('created_by, user_id, client_name, freelancer_name')
        .eq('id', itemId)
        .single();
      itemData = data;
      recipientUserId = data?.created_by || data?.user_id;
    } else if (type === 'proposal') {
      const { data } = await supabase
        .from('proposals')
        .select('user_identifier, client_name')
        .eq('id', itemId)
        .single();
      itemData = data;
      recipientUserId = data?.user_identifier;
    } else if (type === 'payment_link') {
      const { data } = await supabase
        .from('payment_links')
        .select('created_by, user_name, payment_reason')
        .eq('id', itemId)
        .single();
      itemData = data;
      recipientUserId = data?.created_by;
    }

    if (!recipientUserId) {
      console.error('❌ No recipient user ID found for notification');
      return;
    }

    const notificationPayload = {
      type: type,
      id: itemId,
      amount: parseFloat(event.amount.toString()) / 1000000, // Convert from wei to USDC
      currency: 'USDC',
      transactionHash: event.transactionHash,
      payerWallet: event.payer,
      recipientWallet: event.freelancer,
      status: 'paid',
      chain: 'base',
      recipientUserId: recipientUserId,
      // Add type-specific data
      ...(type === 'invoice' && {
        freelancerName: itemData?.freelancer_name,
        clientName: itemData?.client_name
      }),
      ...(type === 'payment_link' && {
        userName: itemData?.user_name,
        paymentReason: itemData?.payment_reason
      })
    };

    console.log('📤 Sending payment notification:', { type, itemId, recipientUserId });

    const response = await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notificationPayload),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to send payment notification:', errorText);
    } else {
      console.log('✅ Payment notification sent successfully');
    }
  } catch (notificationError) {
    console.error('❌ Error sending payment notification:', notificationError);
  }
}

/**
 * Stop the payment listener
 */
export function stopPaymentListener(): void {
  if (paymentService && isListenerRunning) {
    // Note: ethers.js doesn't have a direct way to stop listening
    // In a production environment, you might want to implement a more sophisticated
    // listener management system
    isListenerRunning = false;
    console.log('Payment listener stopped');
  }
}

/**
 * Check if the payment listener is running
 */
export function isPaymentListenerRunning(): boolean {
  return isListenerRunning;
}

/**
 * Get payment listener status
 */
export function getPaymentListenerStatus() {
  return {
    isRunning: isListenerRunning,
    contractAddress: CONTRACT_ADDRESS,
    rpcUrl: RPC_URL,
    hasPaymentService: !!paymentService,
    hasSupabase: !!supabase
  };
}