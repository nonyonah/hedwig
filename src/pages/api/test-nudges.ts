import { NextApiRequest, NextApiResponse } from 'next';
import { SmartNudgeService } from '../../lib/smartNudgeService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 Testing nudge system...');

    // Get targets that would be eligible for nudging
    const targets = await SmartNudgeService.getTargetsForNudging();
    
    console.log(`📋 Found ${targets.length} targets eligible for nudging`);
    
    // Get detailed information about each target
    const targetDetails = targets.map(target => ({
      id: target.id,
      type: target.type,
      title: target.title,
      amount: target.amount,
      clientEmail: target.clientEmail,
      nudgeCount: target.nudgeCount,
      lastNudgeAt: target.lastNudgeAt,
      viewedAt: target.viewedAt,
      createdAt: target.createdAt,
      nudgeDisabled: target.nudgeDisabled,
      daysSinceViewed: target.viewedAt ? 
        Math.floor((Date.now() - new Date(target.viewedAt).getTime()) / (1000 * 60 * 60 * 24)) : null,
      daysSinceLastNudge: target.lastNudgeAt ? 
        Math.floor((Date.now() - new Date(target.lastNudgeAt).getTime()) / (1000 * 60 * 60 * 24)) : null,
      daysSinceCreated: Math.floor((Date.now() - new Date(target.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    }));

    // Get nudge statistics
    const stats = await SmartNudgeService.getNudgeStats();

    return res.status(200).json({
      success: true,
      eligibleTargets: targets.length,
      targets: targetDetails,
      statistics: stats,
      nudgeConfig: {
        maxNudges: 3,
        nudgeDelayHours: 24,
        nudgeIntervalHours: 48
      },
      message: `Found ${targets.length} targets eligible for nudging`
    });

  } catch (error: any) {
    console.error('🚨 Nudge test error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}