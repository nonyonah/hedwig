import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, userId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: 'Message and userId are required' });
    }

    console.log('🧪 Testing payment link creation with message:', message);

    // Import the actions handler
    const { handleAction } = await import('../../api/actions');

    // Parse the intent and parameters
    const { parseIntentAndParams } = await import('../../lib/intentParser');
    const { intent, params } = parseIntentAndParams(message);

    console.log('🔍 Parsed intent:', intent);
    console.log('🔍 Parsed params:', params);

    if (intent === 'create_payment_link') {
      // Add the original text to params for extraction
      params.text = message;
      
      const result = await handleAction(intent, params, userId);
      
      console.log('✅ Payment link creation result:', result);
      
      return res.status(200).json({
        success: true,
        intent,
        params,
        result
      });
    } else {
      return res.status(200).json({
        success: false,
        message: 'Intent not recognized as payment link creation',
        intent,
        params
      });
    }

  } catch (error) {
    console.error('❌ Test payment link error:', error);
    return res.status(500).json({ 
      error: 'Test failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}