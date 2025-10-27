import { NextApiRequest, NextApiResponse } from 'next';
import { projectNotificationService } from '../../services/projectNotificationService';

interface TestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Test notification without database logging
    const testData = {
      contractId: 'test-contract-123',
      projectTitle: 'Test Project',
      freelancerId: 'test-freelancer',
      freelancerName: 'John Doe',
      freelancerEmail: 'john@example.com',
      clientName: 'Jane Client',
      clientEmail: 'jane@example.com',
      amount: 1000,
      currency: 'USDC',
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    };

    // Test deadline notification
    await projectNotificationService.sendDeadlineReminder(testData, 'approaching');

    return res.status(200).json({
      success: true,
      message: 'Test notification sent successfully (database logging may have failed if table does not exist)'
    });

  } catch (error) {
    console.error('Error in test notifications:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}