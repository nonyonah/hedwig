const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: '.env.local' });

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function refreshTelegramChats() {
  try {
    console.log('🔄 Refreshing Telegram chat connections...');
    
    // Get bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('❌ TELEGRAM_BOT_TOKEN not found in environment');
      return;
    }
    
    console.log('✅ Bot token found, creating bot instance...');
    const bot = new TelegramBot(botToken, { polling: false });
    
    // Get bot info
    try {
      const botInfo = await bot.getMe();
      console.log('🤖 Bot info:', {
        id: botInfo.id,
        username: botInfo.username,
        first_name: botInfo.first_name
      });
      
      console.log(`\n📱 Bot link: https://t.me/${botInfo.username}`);
      console.log('\n📋 Instructions for users:');
      console.log('1. Click the bot link above or search for @' + botInfo.username + ' on Telegram');
      console.log('2. Start a conversation by sending /start or any message');
      console.log('3. The bot will automatically update your chat ID in the database');
      
    } catch (botError) {
      console.error('❌ Bot error:', botError.message);
      return;
    }
    
    // Get users with telegram_chat_id
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, telegram_chat_id')
      .not('telegram_chat_id', 'is', null)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Database error:', error);
      return;
    }
    
    console.log(`\n👥 Found ${users.length} users with Telegram chat IDs:`);
    
    for (const user of users) {
      console.log(`   📱 ${user.name} (${user.email}) - Chat ID: ${user.telegram_chat_id}`);
    }
    
    // Test sending a message to users
    const activeUsers = users.filter(user => user.telegram_chat_id);
    
    if (activeUsers.length > 0) {
      console.log(`\n🧪 Testing message delivery to ${activeUsers.length} users...`);
      
      for (const user of activeUsers.slice(0, 3)) { // Test only first 3 users
        try {
          await bot.sendMessage(user.telegram_chat_id, 
            '🔧 *Connection Test*\n\n' +
            'This is a test message to verify your Telegram notifications are working correctly. ' +
            'If you receive this, your connection is active!\n\n' +
            '✅ Your notifications are working properly.',
            { parse_mode: 'Markdown' }
          );
          console.log(`   ✅ Test message sent to ${user.name}`);
        } catch (sendError) {
          console.log(`   ❌ Failed to send to ${user.name}: ${sendError.message}`);
          
          // Log if chat not found
          if (sendError.message.includes('chat not found')) {
            console.log(`   📝 ${user.name} needs to restart the bot`);
          }
        }
      }
    }
    
    console.log('\n🎯 Summary:');
    console.log('- Users who can\'t receive messages should start a conversation with the bot');
    console.log('- Once they send /start, their chat ID will be refreshed automatically');
    console.log('- Payment notifications will then work correctly');
    
  } catch (error) {
    console.error('❌ General error:', error);
  }
}

refreshTelegramChats();