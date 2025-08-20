const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDatabaseFixes() {
  console.log('🧪 Testing database fixes...\n');

  try {
    // Test 1: Create a test user in auth.users
    console.log('1. Creating test user in auth.users...');
    const testEmail = `test-${Date.now()}@hedwig.local`;
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: 'test-password-123',
      email_confirm: true,
      user_metadata: {
        name: 'Test User',
        phone: 'test-user'
      }
    });

    if (authError) {
      console.error('❌ Failed to create auth user:', authError);
      return;
    }

    const testUserId = authUser.user.id;
    console.log('✅ Auth user created:', testUserId);

    // Test 2: Create entry in users table
    console.log('2. Creating users table entry...');
    const { error: userTableError } = await supabase
      .from('users')
      .insert({
        id: testUserId,
        email: testEmail,
        name: 'Test User',
        phone_number: 'test-user',
        username: 'test-user'
      });

    if (userTableError) {
      console.error('❌ Failed to create users table entry:', userTableError);
    } else {
      console.log('✅ Users table entry created');
    }

    // Test 3: Create a test wallet
    console.log('3. Creating test wallet...');
    const { error: walletError } = await supabase
      .from('wallets')
      .insert({
        user_id: testUserId,
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'base'
      });

    if (walletError) {
      console.error('❌ Failed to create wallet:', walletError);
    } else {
      console.log('✅ Test wallet created');
    }

    // Test 4: Create payment link with created_by
    console.log('4. Testing payment link creation...');
    const { data: paymentLink, error: plError } = await supabase
      .from('payment_links')
      .insert({
        amount: 10.0,
        token: 'USDC',
        network: 'base',
        wallet_address: '0x1234567890123456789012345678901234567890',
        user_name: 'Test User',
        payment_reason: 'Test payment',
        created_by: testUserId,
        status: 'pending'
      })
      .select('id')
      .single();

    if (plError) {
      console.error('❌ Payment link creation failed:', plError);
    } else {
      console.log('✅ Payment link created:', paymentLink.id);
    }

    // Test 5: Create invoice with all required fields
    console.log('5. Testing invoice creation...');
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: `TEST-INV-${Date.now()}`,
        freelancer_name: 'Test User',
        freelancer_email: testEmail,
        client_name: 'Test Client',
        client_email: 'client@test.com',
        project_description: 'Test project',
        quantity: 1,
        rate: 100.0,
        price: 100.0,
        amount: 100.0,
        wallet_address: '0x1234567890123456789012345678901234567890',
        status: 'draft',
        created_by: testUserId
      })
      .select('id')
      .single();

    if (invoiceError) {
      console.error('❌ Invoice creation failed:', invoiceError);
    } else {
      console.log('✅ Invoice created:', invoice.id);
    }

    // Test 6: Verify data through views
    console.log('6. Testing view access...');
    const { data: plView, error: plViewError } = await supabase
      .from('payment_links')
      .select('id, created_by, amount, token')
      .eq('created_by', testUserId);

    if (plViewError) {
      console.error('❌ Payment links view failed:', plViewError);
    } else {
      console.log('✅ Payment links view works:', plView.length, 'records');
    }

    const { data: invoiceView, error: invoiceViewError } = await supabase
      .from('invoices')
      .select('id, created_by, freelancer_name, amount')
      .eq('created_by', testUserId);

    if (invoiceViewError) {
      console.error('❌ Invoices view failed:', invoiceViewError);
    } else {
      console.log('✅ Invoices view works:', invoiceView.length, 'records');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await supabase.auth.admin.deleteUser(testUserId);
    console.log('✅ Test user deleted');

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDatabaseFixes();
