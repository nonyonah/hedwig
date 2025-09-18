const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testTransactionFlow() {
  console.log('Testing actual transaction flow...');
  
  // Find the user
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, phone_number, username')
    .ilike('phone_number', '%810179883%');
  
  if (userError || !users || users.length === 0) {
    console.error('Error finding user:', userError);
    return;
  }
  
  const user = users[0];
  console.log('Found user:', user.id);
  
  // Get user wallets (same as handleSend)
  const { data: wallets } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", user.id);

  if (!wallets || wallets.length === 0) {
    console.log("No wallets found");
    return;
  }
  
  console.log('\nWallets available:');
  wallets.forEach((wallet, index) => {
    console.log(`  ${index + 1}. ${wallet.address} (${wallet.chain})`);
  });
  
  // Simulate wallet selection logic for EVM transaction
  const selectedWallet = wallets.find(w => w.chain === 'evm');
  console.log('\nSelected wallet for EVM transaction:', selectedWallet?.address);
  
  if (selectedWallet) {
    console.log('Selected wallet details:');
    console.log('  Address:', selectedWallet.address);
    console.log('  Chain:', selectedWallet.chain);
    console.log('  CDP Wallet ID:', selectedWallet.cdp_wallet_id);
    
    // Test the account name generation logic
    const { data: userDetails, error: userDetailsError } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', selectedWallet.user_id)
      .single();
    
    if (userDetailsError || !userDetails) {
      console.error('Error getting user details:', userDetailsError);
      return;
    }
    
    // Format the phone number to create the same account name as during wallet creation
    let accountName = userDetails.phone_number;
    accountName = accountName.replace(/[^a-zA-Z0-9-]/g, '');
    if (accountName.startsWith('+')) {
      accountName = 'p' + accountName.substring(1);
    }
    if (accountName.length < 2) {
      accountName = 'user-' + accountName;
    } else if (accountName.length > 36) {
      accountName = accountName.substring(0, 36);
    }
    
    console.log('\nAccount name that would be used:', accountName);
    console.log('Expected account name: telegram810179883');
    console.log('Match:', accountName === 'telegram810179883');
    
    console.log('\n=== TRANSACTION FLOW SUMMARY ===');
    console.log('From Address (selectedWallet.address):', selectedWallet.address);
    console.log('CDP Account Name:', accountName);
    console.log('Expected Wallet: 0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27');
    console.log('Expected Account: telegram810179883');
    console.log('Wallet Match:', selectedWallet.address === '0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27');
    console.log('Account Match:', accountName === 'telegram810179883');
  }
}

testTransactionFlow().catch(console.error);