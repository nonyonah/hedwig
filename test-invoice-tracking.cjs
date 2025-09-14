const { createClient } = require('@supabase/supabase-js');

// Load environment using the project's method
async function loadEnv() {
  try {
    const { loadServerEnvironment } = await import('./src/lib/serverEnv.ts');
    await loadServerEnvironment();
  } catch (error) {
    console.log('Using fallback env loading...');
    require('dotenv').config({ path: '.env.local' });
  }
}

// Initialize Supabase client
let supabase;

async function testInvoiceTracking() {
  console.log('🧪 Testing Invoice Tracking...');
  
  // Load environment and initialize Supabase
  await loadEnv();
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  try {
    // Test 1: Check if we can query invoices by created_by field
    console.log('\n1. Testing invoice retrieval by created_by field...');
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, invoice_number, amount, client_name, client_email, status, date_created, created_by')
      .limit(5);
    
    if (invoicesError) {
      console.error('❌ Error querying invoices:', invoicesError);
      return;
    }
    
    console.log(`✅ Found ${invoices?.length || 0} invoices`);
    if (invoices && invoices.length > 0) {
      console.log('Sample invoice:', {
        id: invoices[0].id,
        invoice_number: invoices[0].invoice_number,
        amount: invoices[0].amount,
        client_name: invoices[0].client_name,
        created_by: invoices[0].created_by,
        date_created: invoices[0].date_created
      });
    }
    
    // Test 2: Check if we can find users with invoices
    console.log('\n2. Testing user-invoice relationship...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, telegram_chat_id')
      .limit(3);
    
    if (usersError) {
      console.error('❌ Error querying users:', usersError);
      return;
    }
    
    console.log(`✅ Found ${users?.length || 0} users`);
    
    if (users && users.length > 0) {
      const testUser = users[0];
      console.log('Testing with user:', { id: testUser.id, name: testUser.name });
      
      // Query invoices for this user using created_by field
      const { data: userInvoices, error: userInvoicesError } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, status, date_created')
        .eq('created_by', testUser.id)
        .order('date_created', { ascending: false })
        .limit(5);
      
      if (userInvoicesError) {
        console.error('❌ Error querying user invoices:', userInvoicesError);
      } else {
        console.log(`✅ User has ${userInvoices?.length || 0} invoices`);
        if (userInvoices && userInvoices.length > 0) {
          console.log('User invoices:', userInvoices.map(inv => ({
            id: inv.id,
            number: inv.invoice_number,
            amount: inv.amount,
            status: inv.status
          })));
        }
      }
    }
    
    // Test 3: Check invoice schema fields
    console.log('\n3. Testing invoice schema fields...');
    if (invoices && invoices.length > 0) {
      const sampleInvoice = invoices[0];
      const requiredFields = ['id', 'amount', 'date_created', 'created_by'];
      const missingFields = requiredFields.filter(field => !(field in sampleInvoice));
      
      if (missingFields.length === 0) {
        console.log('✅ All required fields present in invoice schema');
      } else {
        console.log('❌ Missing fields in invoice schema:', missingFields);
      }
    }
    
    console.log('\n🎉 Invoice tracking test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testInvoiceTracking();