import { NextApiRequest, NextApiResponse } from 'next';
import { projectMonitoringService } from '../../../services/projectMonitoringService';

interface MonitoringResponse {
  success: boolean;
  message: string;
  timestamp: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MonitoringResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      timestamp: new Date().toISOString()
    });
  }

  // Verify the request is authorized (you can add API key validation here)
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.MONITORING_API_KEY || 'hedwig-monitoring-key';
  
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
      timestamp: new Date().toISOString()
    });
  }

  try {
    console.log('[MonitoringAPI] Starting project notification monitoring...');
    
    // Run all monitoring checks
    await projectMonitoringService.runAllChecks();
    
    return res.status(200).json({
      success: true,
      message: 'Project monitoring completed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[MonitoringAPI] Error running project monitoring:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error running project monitoring',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Export the monitoring service for manual testing
export { projectMonitoringService };