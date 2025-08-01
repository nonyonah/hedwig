import { NextApiRequest, NextApiResponse } from 'next';
import { HedwigPaymentService } from '../../../contracts/HedwigPaymentService';
import { PaymentReceivedEvent } from '../../../contracts/types';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const CONTRACT_ADDRESS = process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS || '';
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
          
          // Update invoice/proposal status if applicable
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