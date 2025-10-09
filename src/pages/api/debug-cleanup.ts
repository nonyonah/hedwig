import { NextApiRequest, NextApiResponse } from 'next';
import { transactionStorage } from '../../lib/transactionStorage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[DebugCleanup] Manual cleanup requested...');
    
    // Get current transaction count
    const sizeBefore = await transactionStorage.getSize();
    
    // Run cleanup
    const cleanedCount = await transactionStorage.cleanupExpired();
    
    // Get new transaction count
    const sizeAfter = await transactionStorage.getSize();
    
    const result = {
      success: true,
      sizeBefore,
      sizeAfter,
      cleanedCount,
      message: `Cleanup completed. Removed ${cleanedCount} transactions. Size changed from ${sizeBefore} to ${sizeAfter}.`
    };
    
    console.log('[DebugCleanup] Manual cleanup result:', result);
    
    return res.status(200).json(result);

  } catch (error: any) {
    console.error('[DebugCleanup] Manual cleanup error:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}