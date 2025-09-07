import { supabase } from './src/lib/supabase.ts';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

async function testTelegramChat() {
  try {
    console.log('Testing Telegram chat functionality...');
    
    // Get users with telegram_chat_id
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, telegram_chat_id')
      .not('telegram_chat_id', 'is', null)
      .limit(5);
    
    if (error) {
      console.error('Database error:', error);
      return;
    }
    
    console.log('Found users with Telegram chat IDs:', users);
    
    // Test bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not found in environment');
      return;
    }
    
    console.log('Bot token found, creating bot instance...');
    const bot = new TelegramBot(botToken, { polling: false });
    
    // Get bot info
    try {
      const botInfo = await bot.getMe();
      console.log('Bot info:', {
        id: botInfo.id,
        username: botInfo.username,
        first_name: botInfo.first_name
      });
    } catch (botError) {
      console.error('Bot error:', botError.message);
      return;
    }
    
    // Test sending a message to the first user
    if (users && users.length > 0) {
      const testUser = users[0];
      console.log(`Testing message to user: ${testUser.name} (chat_id: ${testUser.telegram_chat_id})`);
      
      try {
        await bot.sendMessage(testUser.telegram_chat_id, 
          '🔧 *Test Message*\n\nThis is a test message to verify the Telegram bot is working correctly. If you receive this, the bot connection is successful!',
          { parse_mode: 'Markdown' }
        );
        console.log('✅ Test message sent successfully!');
      } catch (sendError) {
        console.error('❌ Failed to send test message:', sendError.message);
        console.error('Error details:', sendError);
      }
    }
    
  } catch (error) {
    console.error('General error:', error);
  }
}

testTelegramChat();