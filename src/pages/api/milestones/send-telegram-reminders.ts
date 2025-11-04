import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ReminderResponse {
  success: boolean;
  message?: string;
  reminders_sent?: number;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReminderResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Get milestones approaching deadline (next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const { data: milestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        description,
        amount,
        status,
        deadline,
        contract_id,
        project_contracts (
          id,
          project_title,
          freelancer_id,
          client_email
        )
      `)
      .in('status', ['pending', 'in_progress'])
      .lte('deadline', sevenDaysFromNow.toISOString())
      .gte('deadline', new Date().toISOString()); // Only future deadlines

    if (milestonesError) {
      console.error('Error fetching milestones:', milestonesError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch milestones'
      });
    }

    if (!milestones || milestones.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No milestones approaching deadline',
        reminders_sent: 0
      });
    }

    let remindersSent = 0;

    // Send reminders for each milestone
    for (const milestone of milestones) {
      try {
        const contract = Array.isArray(milestone.project_contracts) 
          ? milestone.project_contracts[0] 
          : milestone.project_contracts;

        if (!contract?.freelancer_id) {
          console.log(`Skipping milestone ${milestone.id} - no freelancer_id`);
          continue;
        }

        // Get freelancer's Telegram chat ID
        const { data: freelancer, error: freelancerError } = await supabase
          .from('users')
          .select('telegram_chat_id')
          .eq('id', contract.freelancer_id)
          .single();

        if (freelancerError || !freelancer?.telegram_chat_id) {
          console.log(`Skipping milestone ${milestone.id} - no telegram_chat_id for freelancer`);
          continue;
        }

        // Calculate days until deadline
        const deadlineDate = new Date(milestone.deadline);
        const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

        // Check if we should send reminder (1, 3, or 7 days before)
        if (![1, 3, 7].includes(daysUntilDeadline)) {
          continue;
        }

        // Check if reminder was already sent today
        const today = new Date().toISOString().split('T')[0];
        const { data: existingReminder } = await supabase
          .from('milestone_notifications')
          .select('id')
          .eq('milestone_id', milestone.id)
          .eq('notification_type', 'deadline_reminder')
          .gte('sent_at', `${today}T00:00:00.000Z`)
          .single();

        if (existingReminder) {
          console.log(`Reminder already sent today for milestone ${milestone.id}`);
          continue;
        }

        // Send Telegram reminder
        await sendTelegramMilestoneReminder(
          freelancer.telegram_chat_id,
          {
            ...milestone,
            project_title: contract.project_title
          },
          daysUntilDeadline
        );

        // Log the reminder
        await supabase.from('milestone_notifications').insert({
          milestone_id: milestone.id,
          contract_id: milestone.contract_id,
          notification_type: 'deadline_reminder',
          recipient_type: 'freelancer',
          freelancer_email: null, // We're sending via Telegram
          client_email: contract.client_email,
          sent_at: new Date().toISOString()
        });

        remindersSent++;
        console.log(`Sent reminder for milestone ${milestone.id} to chat ${freelancer.telegram_chat_id}`);

      } catch (error) {
        console.error(`Error sending reminder for milestone ${milestone.id}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sent ${remindersSent} milestone reminders`,
      reminders_sent: remindersSent
    });

  } catch (error) {
    console.error('Error sending milestone reminders:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function sendTelegramMilestoneReminder(
  chatId: string,
  milestone: any,
  daysUntilDeadline: number
): Promise<void> {
  try {
    const urgencyEmoji = daysUntilDeadline <= 1 ? '🚨' : daysUntilDeadline <= 3 ? '⚠️' : '📅';
    const urgencyText = daysUntilDeadline <= 1 ? 'URGENT' : daysUntilDeadline <= 3 ? 'Soon' : 'Upcoming';
    
    const message = `${urgencyEmoji} **Milestone Deadline ${urgencyText}**

**Project:** ${milestone.project_title}
**Milestone:** ${milestone.title}
**Amount:** $${milestone.amount}
**Deadline:** ${new Date(milestone.deadline).toLocaleDateString()}
**Days Remaining:** ${daysUntilDeadline}

${daysUntilDeadline <= 1 ? 
  '🚨 **This milestone is due very soon!**' : 
  daysUntilDeadline <= 3 ? 
  '⚠️ **This milestone is due soon.**' : 
  '📅 **Reminder: This milestone is approaching its deadline.**'
}

Current Status: ${milestone.status.replace('_', ' ').toUpperCase()}

${milestone.status === 'in_progress' ? 
  '💡 Ready to submit? Use /milestone submit' : 
  '💡 Start working with /milestone or click the button below'
}`;

    const keyboard = {
      inline_keyboard: [
        milestone.status === 'in_progress' ? 
          [{ text: '✅ Submit Now', callback_data: `milestone_submit_${milestone.id}` }] : 
          [{ text: '🔄 Start Working', callback_data: `milestone_start_${milestone.id}` }],
        [{ text: '📋 View All Milestones', callback_data: 'milestone_list' }]
      ]
    };

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }

  } catch (error) {
    console.error('Error sending Telegram milestone reminder:', error);
    throw error;
  }
}