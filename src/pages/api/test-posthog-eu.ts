import type { NextApiRequest, NextApiResponse } from 'next';
import { testPostHogConnection, trackEvent } from '../../lib/posthog';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Testing PostHog EU endpoint...');
    
    // Test the connection
    const testResult = await testPostHogConnection('test_user_eu_endpoint');
    
    // Send a test event
    await trackEvent('test_eu_endpoint_event', {
      test_type: 'eu_endpoint_verification',
      timestamp: new Date().toISOString(),
      source: 'api_test'
    }, 'test_user_eu_endpoint');
    
    console.log('PostHog EU test completed:', testResult);
    
    res.status(200).json({
      success: true,
      message: 'PostHog EU endpoint test completed',
      testResult,
      note: 'Check your PostHog EU dashboard for the test events'
    });
  } catch (error) {
    console.error('PostHog EU test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      note: 'PostHog EU endpoint test failed'
    });
  }
}