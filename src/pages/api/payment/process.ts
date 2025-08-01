import { NextApiRequest, NextApiResponse } from 'next';
import { HedwigPaymentService } from '../../../contracts/HedwigPaymentService';
import { PaymentRequest, PaymentResponse } from '../../../contracts/types';

// Environment variables for contract configuration
const CONTRACT_ADDRESS = process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS || '';
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const PLATFORM_PRIVATE_KEY = process.env.PLATFORM_PRIVATE_KEY || '';

// Initialize payment service
const paymentService = new HedwigPaymentService(
  CONTRACT_ADDRESS,
  RPC_URL,
  PLATFORM_PRIVATE_KEY
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PaymentResponse | { error: string; details?: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const paymentRequest: PaymentRequest = req.body;

    // Validate required fields
    if (!paymentRequest.token || !paymentRequest.amount || !paymentRequest.freelancer || !paymentRequest.invoiceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate token is whitelisted
    const isWhitelisted = await paymentService.isTokenWhitelisted(paymentRequest.token);
    if (!isWhitelisted) {
      return res.status(400).json({ error: 'Token is not whitelisted' });
    }

    // Process the payment
    const result = await paymentService.processPayment(paymentRequest);

    if (result.success) {
      // Log successful payment for backend processing
      console.log('Payment processed successfully:', {
        transactionHash: result.transactionHash,
        invoiceId: paymentRequest.invoiceId,
        freelancer: paymentRequest.freelancer,
        amount: paymentRequest.amount
      });

      return res.status(200).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Payment processing error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

// Export payment service for use in other parts of the application
export { paymentService };