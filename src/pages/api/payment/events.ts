import { NextApiRequest, NextApiResponse } from 'next';
import { HedwigPaymentService } from '../../../contracts/HedwigPaymentService';
import { PaymentReceivedEvent } from '../../../contracts/types';
import { createClient } from '@supabase/supabase-js';
import { formatBigInt, makeSerializable } from '../../../lib/bigintUtils';

// Environment variables - ensure all required env vars are set
const CONTRACT_ADDRESS = process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS || process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET;
const RPC_URL = process.env.BASE_RPC_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
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

// Debug environment variables
console.log('Environment variables loaded:');
console.log('All env vars:', Object.keys(process.env).filter(key => key.includes('HEDWIG')));
console.log('CONTRACT_ADDRESS:', CONTRACT_ADDRESS);
console.log('MAINNET_ADDRESS:', process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET);
console.log('RPC_URL:', RPC_URL);
console.log('SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Not set');

// Initialize services
const paymentService = new HedwigPaymentService(CONTRACT_ADDRESS, RPC_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
        events = await paymentService.getPaymentEventsByInvoice(
          invoiceId as string
        );
      } else if (freelancer) {
        events = await paymentService.getPaymentEventsByFreelancer(
          freelancer as string
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

// Helper function to format payment amount for display (deprecated - use formatBigInt from bigintUtils)
export function formatPaymentAmount(amount: bigint, decimals: number = 6): string {
  return formatBigInt(amount, decimals);
}

// Helper function to get token symbol from address
export function getTokenSymbol(tokenAddress: string): string {
  const tokens: { [key: string]: string } = {
    // Base
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'USDT',
    '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': 'USDbC',
    // Ethereum
    '0xA0b86a33E6441b8C4505E2c52C6b6046d5b0b6e6': 'USDC',
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT',
    // BSC
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'USDC',
    '0x55d398326f99059fF775485246999027B3197955': 'USDT',
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': 'WBNB',
    // Arbitrum One
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT',
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1': 'WETH',
    // Celo
    '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e': 'USDT',
    '0x471EcE3750Da237f93B8E339c536989b8978a438': 'CELO',
    // Lisk
    '0x6033F7f88332B8db6ad452B7C6d5bB643990aE3f': 'LSK'
  };
  
  return tokens[tokenAddress] || 'Unknown';
}