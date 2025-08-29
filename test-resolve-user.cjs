require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testResolveUserId(userId) {
  try {
    console.log(`Testing resolveUserId for telegram_chat_id: ${userId}`);
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, telegram_chat_id')
      .eq('telegram_chat_id', userId)
      .single();
    
    if (error) {
      console.log('User not found by telegram_chat_id - this is expected behavior now');
      console.log('Error:', error.message);
      return null;
    }
    
    if (user) {
      console.log('Found existing user by telegram_chat_id:', user.id);
      return user.id;
    }
    
    return null;
  } catch (error) {
    console.error('Unexpected error:', error.message);
    return null;
  }
}

// Test with the problematic user ID
testResolveUserId('810179883').then(result => {
  console.log('Final result:', result);
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});