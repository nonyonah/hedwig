// Test script to debug milestone reminder system
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugMilestoneReminders() {
  console.log('=== Debugging Milestone Reminder System ===\n');

  // Get milestones approaching deadline (next 7 days)
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  
  console.log('Looking for milestones between now and:', sevenDaysFromNow.toISOString());
  
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
    return;
  }

  console.log(`Found ${milestones?.length || 0} milestones approaching deadline:\n`);

  if (!milestones || milestones.length === 0) {
    console.log('No milestones found. Checking all milestones...\n');
    
    // Check all milestones to see what's available
    const { data: allMilestones } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
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
      .limit(10);
    
    console.log('All milestones (first 10):');
    allMilestones?.forEach((milestone, index) => {
      console.log(`${index + 1}. ${milestone.title}`);
      console.log(`   Status: ${milestone.status}`);
      console.log(`   Deadline: ${milestone.deadline}`);
      console.log(`   Contract: ${milestone.project_contracts?.project_title}`);
      console.log(`   Freelancer ID: ${milestone.project_contracts?.freelancer_id}`);
      console.log('');
    });
    return;
  }

  // Process each milestone
  for (const milestone of milestones) {
    console.log(`Processing milestone: ${milestone.title}`);
    console.log(`  Status: ${milestone.status}`);
    console.log(`  Deadline: ${milestone.deadline}`);
    
    const contract = Array.isArray(milestone.project_contracts) 
      ? milestone.project_contracts[0] 
      : milestone.project_contracts;

    console.log(`  Contract: ${contract?.project_title}`);
    console.log(`  Freelancer ID: ${contract?.freelancer_id}`);

    if (!contract?.freelancer_id) {
      console.log(`  ❌ Skipping - no freelancer_id`);
      continue;
    }

    // Get freelancer's Telegram chat ID
    const { data: freelancer, error: freelancerError } = await supabase
      .from('users')
      .select('telegram_chat_id, telegram_username, name')
      .eq('id', contract.freelancer_id)
      .single();

    if (freelancerError) {
      console.log(`  ❌ Error getting freelancer: ${freelancerError.message}`);
      continue;
    }

    console.log(`  Freelancer: ${freelancer?.name || freelancer?.telegram_username || 'Unknown'}`);
    console.log(`  Telegram Chat ID: ${freelancer?.telegram_chat_id}`);

    if (!freelancer?.telegram_chat_id) {
      console.log(`  ❌ Skipping - no telegram_chat_id`);
      continue;
    }

    // Calculate days until deadline
    const deadlineDate = new Date(milestone.deadline);
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

    console.log(`  Days until deadline: ${daysUntilDeadline}`);

    // Check if we should send reminder (1, 3, or 7 days before)
    if (![1, 3, 7].includes(daysUntilDeadline)) {
      console.log(`  ❌ Skipping - not a reminder day (${daysUntilDeadline} days)`);
      continue;
    }

    console.log(`  ✅ Should send reminder for ${daysUntilDeadline} days!`);

    // Check if reminder was already sent today
    const today = new Date().toISOString().split('T')[0];
    const { data: existingReminder } = await supabase
      .from('milestone_notifications')
      .select('id, sent_at')
      .eq('milestone_id', milestone.id)
      .eq('notification_type', 'deadline_reminder')
      .gte('sent_at', `${today}T00:00:00.000Z`)
      .single();

    if (existingReminder) {
      console.log(`  ❌ Reminder already sent today: ${existingReminder.sent_at}`);
      continue;
    }

    console.log(`  ✅ Ready to send reminder!`);
    console.log('');
  }
}

debugMilestoneReminders().catch(console.error);