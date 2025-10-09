import { NextApiRequest, NextApiResponse } from 'next';
import { SmartNudgeService } from '../../lib/smartNudgeService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { dryRun = false } = req.body;

    console.log(`🔔 ${dryRun ? 'Testing' : 'Triggering'} nudge processing...`);

    if (dryRun) {
      // Just get the targets without sending
      const targets = await SmartNudgeService.getTargetsForNudging();
      
      return res.status(200).json({
        success: true,
        dryRun: true,
        eligibleTargets: targets.length,
        targets: targets.map(t => ({
          id: t.id,
          type: t.type,
          title: t.title,
          clientEmail: t.clientEmail,
          nudgeCount: t.nudgeCount,
          lastNudgeAt: t.lastNudgeAt
        })),
        message: `Dry run: ${targets.length} targets would receive nudges`
      });
    } else {
      // Actually process the nudges
      const result = await SmartNudgeService.processNudges();
      
      return res.status(200).json({
        success: true,
        dryRun: false,
        sent: result.sent,
        failed: result.failed,
        message: `Nudge processing completed: ${result.sent} sent, ${result.failed} failed`
      });
    }

  } catch (error: any) {
    console.error('🚨 Nudge trigger error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}