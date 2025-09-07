const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

async function testTelegramSimple() {
  try {
    console.log('🔄 Testing Telegram bot functionality...');
    
    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
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
      
    } catch (botError) {
      console.error('❌ Bot error:', botError.message);
      return;
    }
    
    // Get users with telegram_chat_id
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, telegram_chat_id')
      .not('telegram_chat_id', 'is', null)
      .limit(5);
    
    if (error) {
      console.error('❌ Database error:', error);
      return;
    }
    
    console.log(`\n👥 Found ${users.length} users with Telegram chat IDs:`);
    
    for (const user of users) {
      console.log(`   📱 ${user.name} (${user.email}) - Chat ID: ${user.telegram_chat_id}`);
    }
    
    // Test sending a message to the first user
    if (users && users.length > 0) {
      const testUser = users[0];
      console.log(`\n🧪 Testing message to: ${testUser.name} (Chat ID: ${testUser.telegram_chat_id})`);
      
      try {
        await bot.sendMessage(testUser.telegram_chat_id, 
          '🔧 *Telegram Test Message*\n\n' +
          'This is a test message to verify your Telegram notifications are working correctly.\n\n' +
          'If you receive this message, your Telegram integration is working! 🎉\n\n' +
          'You should now receive payment notifications through Telegram.',
          { parse_mode: 'Markdown' }
        );
        console.log('✅ Test message sent successfully!');
        console.log('\n🎯 Telegram integration is working correctly!');
        console.log('✅ Users should now receive payment notifications via Telegram.');
        
      } catch (sendError) {
        console.log('❌ Failed to send test message:', sendError.message);
        
        if (sendError.message.includes('chat not found')) {
          console.log('\n🚫 Issue identified: Chat not found');
          console.log('\n📋 Solution steps:');
          console.log('1. User needs to start a conversation with the bot first');
          console.log(`2. Go to: https://t.me/${botInfo.username}`);
          console.log('3. Send /start or any message to the bot');
          console.log('4. The bot will then be able to send notifications');
        } else if (sendError.message.includes('bot was blocked')) {
          console.log('\n🚫 Issue identified: Bot was blocked by user');
          console.log('\n📋 Solution: User needs to unblock the bot and start a conversation');
        } else {
          console.log('\n🚫 Unknown Telegram error:', sendError);
        }
      }
    } else {
      console.log('\n⚠️  No users found with Telegram chat IDs');
      console.log('Users need to start conversations with the bot first.');
    }
    
  } catch (error) {
    console.error('❌ General error:', error);
  }
}

testTelegramSimple();