// Test script to verify milestone system functionality
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testMilestoneSystem() {
  console.log('=== Testing Milestone System ===\n');

  try {
    // 1. Test health endpoint
    console.log('1. Testing system health...');
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();
    console.log(`   Status: ${health.status}`);
    console.log(`   Milestones: ${health.stats?.total_milestones || 0} total, ${health.stats?.pending_milestones || 0} pending\n`);

    // 2. Test milestone reminders
    console.log('2. Testing milestone reminders...');
    const reminderResponse = await fetch(`${baseUrl}/api/milestones/send-telegram-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const reminderResult = await reminderResponse.json();
    console.log(`   Reminders sent: ${reminderResult.reminders_sent || 0}`);
    console.log(`   Message: ${reminderResult.message}\n`);

    // 3. Test bot commands refresh
    console.log('3. Refreshing bot commands...');
    const commandsResponse = await fetch(`${baseUrl}/api/refresh-bot-commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const commandsResult = await commandsResponse.json();
    console.log(`   Success: ${commandsResult.success}`);
    console.log(`   Message: ${commandsResult.message}\n`);

    // 4. Test webhook status
    console.log('4. Testing webhook status...');
    const webhookResponse = await fetch(`${baseUrl}/api/webhook`);
    const webhook = await webhookResponse.json();
    console.log(`   Status: ${webhook.status}`);
    console.log(`   Bot configured: ${webhook.botConfigured}`);
    console.log(`   Webhook set: ${webhook.webhookSet}\n`);

    console.log('✅ Milestone system test completed successfully!');

  } catch (error) {
    console.error('❌ Error testing milestone system:', error.message);
  }
}

// Run the test
testMilestoneSystem();