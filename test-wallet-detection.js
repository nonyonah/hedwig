// Test script to verify wallet detection is working
const { createClient } = require('@supabase/supabase-js');

async function testWalletDetection() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Test 1: Check if we can query wallets with all columns
    console.log('Test 1: Querying wallets with all columns...');
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('id, address, chain, cdp_wallet_id, user_id')
      .limit(5);
    
    if (error) {
      console.error('Error querying wallets:', error);
      return;
    }
    
    console.log(`Found ${wallets?.length || 0} wallets:`);
    wallets?.forEach(wallet => {
      console.log(`  - ID: ${wallet.id}, Chain: ${wallet.chain}, Address: ${wallet.address?.substring(0, 10)}...`);
    });
    
    // Test 2: Check if we can find a specific user's wallets
    if (wallets && wallets.length > 0) {
      const testUserId = wallets[0].user_id;
      console.log(`\nTest 2: Querying wallets for user ${testUserId}...`);
      
      const { data: userWallets, error: userError } = await supabase
        .from('wallets')
        .select('id, address, chain, cdp_wallet_id')
        .eq('user_id', testUserId);
      
      if (userError) {
        console.error('Error querying user wallets:', userError);
        return;
      }
      
      console.log(`Found ${userWallets?.length || 0} wallets for user ${testUserId}:`);
      userWallets?.forEach(wallet => {
        console.log(`  - Chain: ${wallet.chain}, Address: ${wallet.address?.substring(0, 10)}...`);
      });
    }
    
    console.log('\n✅ Wallet detection test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testWalletDetection();