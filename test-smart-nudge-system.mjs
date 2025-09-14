import { SmartNudgeService } from './src/lib/smartNudgeService.ts';
import { loadServerEnvironment } from './src/lib/serverEnv.ts';

/**
 * Test script to verify the smart nudge system is working correctly
 * This script will check for targets that need nudging and display the results
 */
async function testSmartNudgeSystem() {
  // Load environment variables
  await loadServerEnvironment();
  console.log('🔍 Testing Smart Nudge System...');
  console.log('=' .repeat(50));

  try {
    // Get all targets that need nudging
    const targets = await SmartNudgeService.getTargetsForNudging();
    
    console.log(`📊 Found ${targets.length} targets that need nudging:`);
    console.log('');

    if (targets.length === 0) {
      console.log('✅ No targets need nudging at this time.');
      return;
    }

    // Group targets by type
    const invoices = targets.filter(t => t.type === 'invoice');
    const paymentLinks = targets.filter(t => t.type === 'payment_link');

    console.log(`📄 Invoices: ${invoices.length}`);
    invoices.forEach((invoice, index) => {
      console.log(`  ${index + 1}. Invoice ${invoice.title}`);
      console.log(`     Amount: $${invoice.amount}`);
      console.log(`     Client: ${invoice.clientEmail}`);
      console.log(`     Sender: ${invoice.senderName}`);
      console.log(`     Viewed: ${invoice.viewedAt ? new Date(invoice.viewedAt).toLocaleDateString() : 'Never'}`);
      console.log(`     Nudge Count: ${invoice.nudgeCount}`);
      console.log(`     Last Nudge: ${invoice.lastNudgeAt ? new Date(invoice.lastNudgeAt).toLocaleDateString() : 'Never'}`);
      console.log('');
    });

    console.log(`💳 Payment Links: ${paymentLinks.length}`);
    paymentLinks.forEach((link, index) => {
      console.log(`  ${index + 1}. ${link.title}`);
      console.log(`     Amount: $${link.amount}`);
      console.log(`     Recipient: ${link.clientEmail}`);
      console.log(`     Sender: ${link.senderName}`);
      console.log(`     Viewed: ${link.viewedAt ? new Date(link.viewedAt).toLocaleDateString() : 'Never'}`);
      console.log(`     Nudge Count: ${link.nudgeCount}`);
      console.log(`     Last Nudge: ${link.lastNudgeAt ? new Date(link.lastNudgeAt).toLocaleDateString() : 'Never'}`);
      console.log('');
    });

    // Test processing nudges (dry run)
    console.log('🧪 Testing nudge processing (dry run)...');
    const result = await SmartNudgeService.processNudges();
    console.log(`✅ Nudge processing completed:`);
    console.log(`   - Sent: ${result.sent}`);
    console.log(`   - Failed: ${result.failed}`);

  } catch (error) {
    console.error('❌ Error testing smart nudge system:', error);
  }
}

// Run the test
testSmartNudgeSystem().then(() => {
  console.log('\n🏁 Test completed.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});