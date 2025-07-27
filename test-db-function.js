const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testDatabaseFunction() {
  console.log('Testing database function...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Test the get_or_create_telegram_user function
    const { data, error } = await supabase.rpc('get_or_create_telegram_user', {
      p_telegram_chat_id: 123456789,
      p_telegram_username: 'testuser',
      p_telegram_first_name: 'Test',
      p_telegram_last_name: 'User',
      p_telegram_language_code: 'en',
    });

    if (error) {
      console.error('Database function error:', error);
    } else {
      console.log('Database function success:', data);
    }
  } catch (err) {
    console.error('Test error:', err);
  }
}

testDatabaseFunction();