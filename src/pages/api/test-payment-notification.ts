import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { testType = 'direct_transfer' } = req.body;

    // Test payload for direct transfer notification
    const testPayload = {
      type: testType,
      id: 'test_transfer_' + Date.now(),
      amount: 10.5,
      currency: 'USDC',
      transactionHash: '0x' + Math.random().toString(16).substring(2, 66),
      senderAddress: '0x' + Math.random().toString(16).substring(2, 42),
      recipientWallet: '0x' + Math.random().toString(16).substring(2, 42),
      recipientUserId: 'test-user-id', // You'll need to replace with actual user ID
      status: 'completed',
      chain: 'base'
    };

    console.log('🧪 Testing payment notification with payload:', testPayload);

    // Get the base URL from environment or use localhost
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const notificationUrl = `${baseUrl}/api/webhooks/payment-notifications`;

    console.log('🌐 Testing notification URL:', notificationUrl);

    const response = await fetch(notificationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hedwig-Test/1.0'
      },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(10000)
    });

    const responseText = await response.text();
    
    console.log('📡 Notification test response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText
    });

    if (response.ok) {
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (e) {
        parsedResponse = responseText;
      }

      return res.status(200).json({
        success: true,
        message: 'Payment notification test successful',
        testPayload,
        notificationUrl,
        response: {
          status: response.status,
          statusText: response.statusText,
          body: parsedResponse
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Payment notification test failed',
        testPayload,
        notificationUrl,
        error: {
          status: response.status,
          statusText: response.statusText,
          body: responseText
        }
      });
    }

  } catch (error: any) {
    console.error('🚨 Payment notification test error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}