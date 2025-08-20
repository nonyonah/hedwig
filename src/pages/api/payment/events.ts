import { NextApiRequest, NextApiResponse } from 'next';
import { HedwigPaymentService } from '../../../contracts/HedwigPaymentService';
import { PaymentReceivedEvent } from '../../../contracts/types';
import { createClient } from '@supabase/supabase-js';

// Environment variables with fallback to hardcoded values for testing
const CONTRACT_ADDRESS = process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS || process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET || '0xfa12d294ac4Aa874C2b922F87b6Dd0EFb764783B';
const RPC_URL = process.env.BASE_RPC_URL || 'https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zzvansqojcmavxqdmgcz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dmFuc3FvamNtYXZ4cWRtZ2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MzgwNTEwNCwiZXhwIjoyMDU5MzgxMTA0fQ.aLOLMl5DK4CJqWa6JfbbhpKkf3bG5XizAr8ZqghT-0A';

// Debug environment variables
console.log('Environment variables loaded:');
console.log('All env vars:', Object.keys(process.env).filter(key => key.includes('HEDWIG')));
console.log('CONTRACT_ADDRESS:', CONTRACT_ADDRESS);
console.log('TESTNET_ADDRESS:', process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET);
console.log('RPC_URL:', RPC_URL);
console.log('SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Not set');

// Initialize services
const paymentService = new HedwigPaymentService(CONTRACT_ADDRESS, RPC_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    // Get payment events for a specific invoice or freelancer
    try {
      const { invoiceId, freelancer, fromBlock } = req.query;
      
      let events: PaymentReceivedEvent[] = [];
      
      if (invoiceId) {
        events = await paymentService.getPaymentsByInvoice(
          invoiceId as string,
          fromBlock ? parseInt(fromBlock as string) : 0
        );
      } else if (freelancer) {
        events = await paymentService.getPaymentsByFreelancer(
          freelancer as string,
          fromBlock ? parseInt(fromBlock as string) : 0
        );
      } else {
        return res.status(400).json({ error: 'Either invoiceId or freelancer parameter is required' });
      }
      
      return res.status(200).json({ events });
    } catch (error: any) {
      console.error('Error fetching payment events:', error);
      return res.status(500).json({ error: 'Failed to fetch payment events' });
    }
  }
  
  if (req.method === 'POST') {
    // Start listening for payment events (webhook setup)
    try {
      console.log('Starting payment event listener...');
      
      // Set up event listener
      await paymentService.listenForPayments(async (event: PaymentReceivedEvent) => {
        console.log('Payment received:', event);
        
        try {
          // Store payment event in database
          const { error: dbError } = await supabase
            .from('payment_events')
            .insert({
              transaction_hash: event.transactionHash,
              payer: event.payer,
              freelancer: event.freelancer,
              token: event.token,
              amount: event.amount.toString(),
              fee: event.fee.toString(),
              invoice_id: event.invoiceId,
              block_number: event.blockNumber,
              timestamp: new Date(event.timestamp * 1000).toISOString(),
              processed: false
            });
          
          if (dbError) {
            console.error('Error storing payment event:', dbError);
            return;
          }
          
          // Update invoice/proposal/payment_link status if applicable
          if (event.invoiceId.startsWith('invoice_')) {
            await supabase
              .from('invoices')
              .update({ 
                status: 'paid',
                paid_at: new Date(event.timestamp * 1000).toISOString(),
                payment_transaction: event.transactionHash
              })
              .eq('id', event.invoiceId.replace('invoice_', ''));
          } else if (event.invoiceId.startsWith('proposal_')) {
            await supabase
              .from('proposals')
              .update({ 
                status: 'paid',
                paid_at: new Date(event.timestamp * 1000).toISOString(),
                payment_transaction: event.transactionHash
              })
              .eq('id', event.invoiceId.replace('proposal_', ''));
          } else {
            // Check if it's a payment link UUID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(event.invoiceId)) {
              // Update payment link status
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
                console.log('Successfully updated payment link status to paid');
                
                // Send webhook notification for payment link
                try {
                  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payment-notifications`, {
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
                    })
                  });
                } catch (webhookError) {
                  console.error('Error sending payment link webhook:', webhookError);
                }
              }
            }
          }
          
          // TODO: Send notification to freelancer via Telegram/WhatsApp
          // TODO: Generate receipt and send to client
          // TODO: Update agent context for future interactions
          
          console.log('Payment event processed successfully');
        } catch (processingError) {
          console.error('Error processing payment event:', processingError);
        }
      });
      
      return res.status(200).json({ message: 'Payment event listener started' });
    } catch (error: any) {
      console.error('Error starting payment listener:', error);
      return res.status(500).json({ error: 'Failed to start payment listener' });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

// Helper function to format payment amount for display
export function formatPaymentAmount(amount: bigint, decimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.replace(/0+$/, '');
  
  return `${wholePart}.${trimmedFractional}`;
}

// Helper function to get token symbol from address
export function getTokenSymbol(tokenAddress: string): string {
  const tokens: { [key: string]: string } = {
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
    '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': 'USDbC'
  };
  
  return tokens[tokenAddress] || 'Unknown';
}