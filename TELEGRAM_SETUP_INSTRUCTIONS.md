# 🤖 Telegram Bot Setup Instructions

## Issue Identified
The Telegram bot token is not properly configured. The current token in `.env` is set to a placeholder value.

## Root Cause
- **TELEGRAM_BOT_TOKEN** in `.env` file is set to `your_telegram_bot_token` (placeholder)
- This causes a "404 Not Found" error when trying to use the bot
- Payment notifications fail with "chat not found" errors

## Solution Steps

### Step 1: Create a Telegram Bot
1. Open Telegram and search for `@BotFather`
2. Start a conversation with BotFather
3. Send `/newbot` command
4. Follow the prompts:
   - Choose a name for your bot (e.g., "Hedwig Payment Assistant")
   - Choose a username ending in "bot" (e.g., "hedwig_payments_bot")
5. BotFather will provide you with a bot token that looks like:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

### Step 2: Update Environment Variables
1. Open the `.env` file in your project root
2. Replace the placeholder token:
   ```env
   # Before (current)
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   
   # After (with your actual token)
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
3. Save the file

### Step 3: Restart the Development Server
1. Stop the current dev server (Ctrl+C in the terminal)
2. Restart with `npm run dev`

### Step 4: Test the Bot
1. Run the test script: `node test-telegram-simple.cjs`
2. If successful, you should see bot information displayed

### Step 5: User Setup
For users to receive notifications:
1. Share the bot link: `https://t.me/your_bot_username`
2. Users must start a conversation by:
   - Clicking the bot link
   - Sending `/start` or any message
   - This establishes the chat connection

## Verification
Once properly configured:
- ✅ Bot info should display when running tests
- ✅ Users who start conversations will receive payment notifications
- ✅ The webhook logs will show successful Telegram message delivery

## Common Issues

### "Chat not found" errors
- **Cause**: User hasn't started a conversation with the bot
- **Solution**: User needs to message the bot first

### "Bot was blocked" errors
- **Cause**: User blocked the bot
- **Solution**: User needs to unblock and restart conversation

### "404 Not Found" errors
- **Cause**: Invalid or missing bot token
- **Solution**: Follow steps above to get a valid token

## Testing Payment Notifications
After setup, test with:
```bash
node test-direct-transfer.js
```

This will send a test payment notification to verify the integration works.