require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUsers() {
  try {
    console.log('Checking users with Telegram data...');
    
    const { data, error } = await supabase
      .from('users')
      .select('id, phone_number, telegram_chat_id, telegram_username, telegram_first_name')
      .limit(10);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log('Total users found:', data.length);
    console.log('\nUsers with Telegram chat IDs:');
    const telegramUsers = data.filter(user => user.telegram_chat_id);
    console.log('Count:', telegramUsers.length);
    
    if (telegramUsers.length > 0) {
      telegramUsers.forEach(user => {
        console.log(`- ID: ${user.id}, Chat ID: ${user.telegram_chat_id}, Username: ${user.telegram_username || 'N/A'}, Name: ${user.telegram_first_name || 'N/A'}`);
      });
    } else {
      console.log('No users with Telegram chat IDs found.');
    }
    
    console.log('\nAll users:');
    data.forEach(user => {
      console.log(`- ID: ${user.id}, Phone: ${user.phone_number}, Telegram Chat ID: ${user.telegram_chat_id || 'None'}`);
    });
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

checkUsers();