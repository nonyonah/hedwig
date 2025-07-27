const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testTelegramFunction() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Testing get_or_create_telegram_user function...');

  try {
    const { data, error } = await supabase.rpc('get_or_create_telegram_user', {
      p_telegram_chat_id: 123456789,
      p_telegram_username: 'testuser',
      p_telegram_first_name: 'Test',
      p_telegram_last_name: 'User',
      p_telegram_language_code: 'en',
    });

    if (error) {
      console.error('❌ Database function error:', error);
      return false;
    }

    console.log('✅ Function executed successfully!');
    console.log('User UUID:', data);
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

testTelegramFunction();