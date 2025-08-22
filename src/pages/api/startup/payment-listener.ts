import { NextApiRequest, NextApiResponse } from 'next';
import { startPaymentListener, getPaymentListenerStatus, isPaymentListenerRunning } from '../../../services/payment-listener-startup';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    // Start the payment listener
    try {
      const success = await startPaymentListener();
      
      if (success) {
        return res.status(200).json({ 
          message: 'Payment listener started successfully',
          status: getPaymentListenerStatus()
        });
      } else {
        return res.status(500).json({ 
          error: 'Failed to start payment listener',
          status: getPaymentListenerStatus()
        });
      }
    } catch (error: any) {
      console.error('Error starting payment listener:', error);
      return res.status(500).json({ 
        error: 'Failed to start payment listener',
        details: error.message,
        status: getPaymentListenerStatus()
      });
    }
  }
  
  if (req.method === 'GET') {
    // Get payment listener status
    try {
      const status = getPaymentListenerStatus();
      return res.status(200).json({ status });
    } catch (error: any) {
      console.error('Error getting payment listener status:', error);
      return res.status(500).json({ 
        error: 'Failed to get payment listener status',
        details: error.message
      });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

// Auto-start the payment listener when this module is loaded
// This ensures the listener starts when the Next.js server boots up
if (process.env.NODE_ENV === 'production' || process.env.AUTO_START_PAYMENT_LISTENER === 'true') {
  // Use setTimeout to avoid blocking the module loading
  setTimeout(async () => {
    if (!isPaymentListenerRunning()) {
      console.log('Auto-starting payment listener...');
      try {
        const success = await startPaymentListener();
        if (success) {
          console.log('✅ Payment listener auto-started successfully');
        } else {
          console.error('❌ Failed to auto-start payment listener');
        }
      } catch (error) {
        console.error('❌ Error auto-starting payment listener:', error);
      }
    }
  }, 5000); // Wait 5 seconds after server start
}