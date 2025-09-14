import { loadServerEnvironment } from './src/lib/serverEnv.ts';
import { SmartNudgeService } from './src/lib/smartNudgeService.ts';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testReminderFiltering() {
  console.log('🧪 Testing reminder filtering system...');
  console.log('=' .repeat(50));

  try {
    // Get a sample user to test with
    const { data: users } = await supabase
      .from('users')
      .select('id, telegram_chat_id')
      .limit(1);

    if (!users || users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }

    const testUser = users[0];
    console.log(`👤 Testing with user: ${testUser.id}`);
    console.log('');

    // Test getUserRemindableItems function
    console.log('📋 Testing getUserRemindableItems function...');
    const remindableItems = await SmartNudgeService.getUserRemindableItems(testUser.id);
    
    console.log(`💳 Payment Links found: ${remindableItems.paymentLinks.length}`);
    remindableItems.paymentLinks.forEach((link, index) => {
      console.log(`   ${index + 1}. ${link.title} - $${link.amount} (${link.clientEmail})`);
    });
    
    console.log(`📄 Invoices found: ${remindableItems.invoices.length}`);
    remindableItems.invoices.forEach((invoice, index) => {
      console.log(`   ${index + 1}. ${invoice.title} - $${invoice.amount} (${invoice.clientEmail})`);
    });
    console.log('');

    // Test raw database queries to see what's being filtered out
    console.log('🔍 Testing raw database queries...');
    
    // Check payment links without filtering
    const { data: allPaymentLinks } = await supabase
      .from('payment_links')
      .select('id, payment_reason, amount, recipient_email, status, paid_at')
      .eq('created_by', testUser.id)
      .neq('status', 'paid')
      .is('paid_at', null);
    
    console.log(`💳 Total payment links (unfiltered): ${allPaymentLinks?.length || 0}`);
    
    // Check payment links with email filtering
    const { data: filteredPaymentLinks } = await supabase
      .from('payment_links')
      .select('id, payment_reason, amount, recipient_email, status, paid_at')
      .eq('created_by', testUser.id)
      .neq('status', 'paid')
      .is('paid_at', null)
      .not('recipient_email', 'is', null)
      .neq('recipient_email', '');
    
    console.log(`💳 Filtered payment links (with emails): ${filteredPaymentLinks?.length || 0}`);
    
    if (allPaymentLinks && filteredPaymentLinks) {
      const filtered = allPaymentLinks.length - filteredPaymentLinks.length;
      console.log(`💳 Payment links filtered out (no email): ${filtered}`);
    }
    
    // Check invoices without filtering
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, client_email, status')
      .eq('user_id', testUser.id)
      .neq('status', 'paid');
    
    console.log(`📄 Total invoices (unfiltered): ${allInvoices?.length || 0}`);
    
    // Check invoices with email filtering
    const { data: filteredInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, client_email, status')
      .eq('user_id', testUser.id)
      .neq('status', 'paid')
      .not('client_email', 'is', null)
      .neq('client_email', '');
    
    console.log(`📄 Filtered invoices (with emails): ${filteredInvoices?.length || 0}`);
    
    if (allInvoices && filteredInvoices) {
      const filtered = allInvoices.length - filteredInvoices.length;
      console.log(`📄 Invoices filtered out (no email): ${filtered}`);
    }
    
    console.log('');
    console.log('✅ Filtering test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during filtering test:', error);
  }
}

// Run the test
testReminderFiltering().catch(console.error);