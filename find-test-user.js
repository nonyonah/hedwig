import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findTestUser() {
  try {
    console.log('Looking for users with telegram_chat_id...');
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, telegram_chat_id')
      .not('telegram_chat_id', 'is', null)
      .limit(5);

    if (error) {
      console.error('Error fetching users:', error);
      return;
    }

    if (users && users.length > 0) {
      console.log('Found users with Telegram chat IDs:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Chat ID: ${user.telegram_chat_id}`);
      });
      
      console.log('\nYou can use any of these user IDs for testing.');
      console.log(`Example: Update test-direct-transfer.js with recipientUserId: '${users[0].id}'`);
    } else {
      console.log('No users found with telegram_chat_id. You may need to set up a test user first.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

findTestUser();