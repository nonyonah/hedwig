import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId } = req.query;

    // Check environment variables
    const envCheck = {
      PAYCREST_API_KEY: !!process.env.PAYCREST_API_KEY,
      PAYCREST_API_SECRET: !!process.env.PAYCREST_API_SECRET,
      PAYCREST_API_TOKEN: !!process.env.PAYCREST_API_TOKEN,
      PAYCREST_WEBHOOK_SECRET: !!process.env.PAYCREST_WEBHOOK_SECRET,
      API_KEY_VALUE: process.env.PAYCREST_API_KEY?.substring(0, 8) + '...',
      SECRET_IS_PLACEHOLDER: process.env.PAYCREST_API_SECRET === 'your_paycrest_mainnet_secret_here'
    };

    console.log('[DebugPaycrest] Environment check:', envCheck);

    let apiTest: any = null;
    if (orderId && typeof orderId === 'string') {
      // Test API call to get order status
      try {
        const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';
        const response = await fetch(`${PAYCREST_API_BASE_URL}/sender/orders/${orderId}`, {
          method: 'GET',
          headers: {
            'API-Key': process.env.PAYCREST_API_KEY!,
            'Content-Type': 'application/json'
          }
        });

        const responseText = await response.text();
        
        apiTest = {
          url: `${PAYCREST_API_BASE_URL}/sender/orders/${orderId}`,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText,
          isJson: response.headers.get('content-type')?.includes('application/json'),
          parsedBody: null,
          parseError: null
        };

        if (apiTest.isJson) {
          try {
            apiTest.parsedBody = JSON.parse(responseText);
          } catch (e: any) {
            apiTest.parseError = e.message;
          }
        }
      } catch (error: any) {
        apiTest = {
          error: error.message,
          stack: error.stack
        };
      }
    }

    return res.status(200).json({
      success: true,
      environment: envCheck,
      apiTest,
      message: orderId 
        ? `API test completed for order ${orderId}` 
        : 'Environment check completed. Add ?orderId=your_order_id to test API calls'
    });

  } catch (error: any) {
    console.error('[DebugPaycrest] Error:', error);
    return res.status(500).json({
      error: 'Debug failed',
      message: error.message
    });
  }
}