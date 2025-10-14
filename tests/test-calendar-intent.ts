import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message = 'connect calendar' } = req.body;

    console.log('[Test] Testing calendar intent parsing for message:', message);

    // Test the enhanced fallback logic from telegramBot.ts
    const lowerMessage = message.toLowerCase();
    let finalIntent = 'unknown';
    let finalParams = { text: message };

    // Apply the enhanced fallback logic (same as in telegramBot.ts)
    if (lowerMessage.includes('calendar')) {
      if (lowerMessage.includes('connect') || lowerMessage.includes('sync') || lowerMessage.includes('link') || lowerMessage.includes('add') || lowerMessage.includes('setup')) {
        if (!lowerMessage.includes('disconnect') && !lowerMessage.includes('unlink') && !lowerMessage.includes('remove')) {
          console.log('[Test] Forcing connect_calendar intent due to clear calendar keywords');
          finalIntent = 'connect_calendar';
          finalParams = { text: message };
        }
      } else if (lowerMessage.includes('disconnect') || lowerMessage.includes('unlink') || lowerMessage.includes('remove') || lowerMessage.includes('disable')) {
        console.log('[Test] Forcing disconnect_calendar intent due to clear calendar keywords');
        finalIntent = 'disconnect_calendar';
        finalParams = { text: message };
      } else if (lowerMessage.includes('status') || lowerMessage.includes('check') || lowerMessage.includes('connected')) {
        console.log('[Test] Forcing calendar_status intent due to clear calendar keywords');
        finalIntent = 'calendar_status';
        finalParams = { text: message };
      }
    }

    return res.status(200).json({
      message,
      finalIntent,
      finalParams,
      success: finalIntent !== 'unknown',
      explanation: finalIntent !== 'unknown' 
        ? `Successfully detected ${finalIntent} intent from calendar keywords`
        : 'No calendar intent detected'
    });

  } catch (error) {
    console.error('[Test] Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    });
  }
}