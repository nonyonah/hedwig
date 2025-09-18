const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkWallets() {
  console.log('Checking wallets for user with phone number containing 810179883...');
  
  // First find the user
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, phone_number, username')
    .ilike('phone_number', '%810179883%');
  
  if (userError) {
    console.error('Error finding user:', userError);
    return;
  }
  
  console.log('Found users:', users);
  
  if (users && users.length > 0) {
    const user = users[0];
    console.log('\nChecking wallets for user:', user.id);
    
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id);
    
    if (walletError) {
      console.error('Error getting wallets:', walletError);
      return;
    }
    
    console.log('\nWallets found:');
    wallets.forEach((wallet, index) => {
      console.log(`Wallet ${index + 1}:`);
      console.log(`  Address: ${wallet.address}`);
      console.log(`  Chain: ${wallet.chain}`);
      console.log(`  CDP Wallet ID: ${wallet.cdp_wallet_id}`);
      console.log(`  Created: ${wallet.created_at}`);
      console.log('');
    });
    
    // Check which one would be selected by the current logic
    const evmWallet = wallets.find(w => w.chain === 'evm');
    console.log('Current selection logic would choose:');
    console.log('EVM Wallet:', evmWallet ? evmWallet.address : 'None found');
    
    // Check if the correct wallet exists
    const correctWallet = wallets.find(w => w.address === '0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27');
    console.log('Correct wallet (0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27):', correctWallet ? 'Found' : 'Not found');
    if (correctWallet) {
      console.log('  Chain:', correctWallet.chain);
      console.log('  CDP Wallet ID:', correctWallet.cdp_wallet_id);
    }
  }
}

checkWallets().catch(console.error);