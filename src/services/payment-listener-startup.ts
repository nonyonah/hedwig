import { HedwigPaymentService } from '../contracts/HedwigPaymentService';
import { createClient } from '@supabase/supabase-js';
import { PaymentReceivedEvent } from '../contracts/types';

// Environment variables
const CONTRACT_ADDRESS = process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS || process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET;
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
      throw new Error('HEDWIG_PAYMENT_CONTRACT_ADDRESS or HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET must be set');
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
    // Store payment event in database
    const { error: dbError } = await supabase
      .from('payment_events')
      .insert({
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
      });

    if (dbError) {
      console.error('Error storing payment event:', dbError);
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

      if (!fetchError && currentInvoice) {
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
        if (!currentInvoice.freelancer_name) {
          updateData.freelancer_name = 'Freelancer';
        }
        if (!currentInvoice.freelancer_email) {
          updateData.freelancer_email = 'freelancer@hedwig.com';
        }
        if (!currentInvoice.client_name) {
          updateData.client_name = 'Client';
        }
        if (!currentInvoice.client_email) {
          updateData.client_email = 'client@hedwig.com';
        }
        if (!currentInvoice.wallet_address) {
          updateData.wallet_address = '0x0000000000000000000000000000000000000000';
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

        await supabase
          .from('invoices')
          .update(updateData)
          .eq('id', invoiceId);
      }
      
      console.log(`✅ Updated invoice ${event.invoiceId} status to paid`);
    } else if (event.invoiceId.startsWith('proposal_')) {
      await supabase
        .from('proposals')
        .update({ 
          status: 'paid',
          paid_at: new Date(event.timestamp * 1000).toISOString(),
          payment_transaction: event.transactionHash
        })
        .eq('id', event.invoiceId.replace('proposal_', ''));
      
      console.log(`✅ Updated proposal ${event.invoiceId} status to paid`);
    } else {
      // Check if it's a payment link UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(event.invoiceId)) {
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
          console.error('Error updating payment link:', paymentLinkError);
        } else {
          console.log(`✅ Updated payment link ${event.invoiceId} status to paid`);
          
          // Send webhook notification for payment link
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'payment_link',
                id: event.invoiceId,
                amount: parseFloat(event.amount.toString()) / 1000000,
                currency: 'USDC',
                transactionHash: event.transactionHash,
                payerWallet: event.payer,
                status: 'paid'
              }),
              signal: AbortSignal.timeout(5000)
            });
          } catch (webhookError) {
            console.error('Error sending payment link webhook:', webhookError);
          }
        }
      }
    }

    console.log('✅ Payment event processed successfully');
  } catch (processingError) {
    console.error('❌ Error processing payment event:', processingError);
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