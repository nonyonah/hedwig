require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testWalletLookup() {
  try {
    console.log('Testing wallet lookup for real transaction recipient...');
    
    // Test the exact address from the real transaction
    const { data: walletData, error: walletError } = await supabase
      .from('wallets')
      .select('user_id, users(id, telegram_chat_id, email, name)')
      .eq('address', 'CQCPLL2jcQAVeHeqXYqDApTic7EzA1d8qPDEwHaW7BGw')
      .single();
    
    console.log('Wallet lookup result:', {
      data: walletData,
      error: walletError
    });
    
    if (walletError || !walletData) {
      console.log('Trying lowercase lookup...');
      const { data: walletDataLower, error: walletErrorLower } = await supabase
        .from('wallets')
        .select('user_id, users(id, telegram_chat_id, email, name)')
        .eq('address', 'CQCPLL2jcQAVeHeqXYqDApTic7EzA1d8qPDEwHaW7BGw'.toLowerCase())
        .single();
      
      console.log('Lowercase lookup result:', {
        data: walletDataLower,
        error: walletErrorLower
      });
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

testWalletLookup();