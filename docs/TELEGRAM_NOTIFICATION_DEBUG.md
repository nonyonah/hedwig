# Telegram Notification Debugging Guide

This guide helps debug Telegram notification issues in the contract approval process.

## Quick Test Commands

### 1. Check Bot Token Configuration
```bash
curl -X POST "http://localhost:3000/api/test-telegram-notification" \
  -H "Content-Type: application/json" \
  -d '{"action": "check_bot_token"}'
```

### 2. List Users with Telegram
```bash
curl -X POST "http://localhost:3000/api/test-telegram-notification" \
  -H "Content-Type: application/json" \
  -d '{"action": "list_users_with_telegram"}'
```

### 3. Check Specific Freelancer's Telegram Info
```bash
curl -X POST "http://localhost:3000/api/test-telegram-notification" \
  -H "Content-Type: application/json" \
  -d '{"action": "check_freelancer_telegram", "freelancerId": "FREELANCER_UUID"}'
```

### 4. Test Direct Telegram Send
```bash
curl -X POST "http://localhost:3000/api/test-telegram-notification" \
  -H "Content-Type: application/json" \
  -d '{"action": "test_telegram_send", "telegramChatId": "CHAT_ID"}'
```

### 5. Test Full Contract Approval Flow
```bash
curl -X POST "http://localhost:3000/api/test-contract-approval" \
  -H "Content-Type: application/json" \
  -d '{"action": "test_approval", "contractId": "CONTRACT_ID"}'
```

## Common Issues & Solutions

### Issue 1: "No Telegram chat ID found for freelancer"
**Symptoms:** Email works but Telegram notification is skipped
**Cause:** Freelancer doesn't have `telegram_chat_id` in database

**Debug Steps:**
1. Check if freelancer has Telegram chat ID:
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "check_freelancer_telegram", "freelancerId": "UUID"}'
   ```

2. If no chat ID, the freelancer needs to:
   - Start a conversation with your Telegram bot
   - Use a command that registers them in the system
   - Check that the bot integration is working

### Issue 2: "Telegram API error: Unauthorized"
**Symptoms:** Bot token error in logs
**Cause:** Invalid or missing `TELEGRAM_BOT_TOKEN`

**Debug Steps:**
1. Check bot token configuration:
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "check_bot_token"}'
   ```

2. Verify environment variable is set:
   ```bash
   echo $TELEGRAM_BOT_TOKEN
   ```

3. Get a new bot token from @BotFather if needed

### Issue 3: "Telegram API error: Bad Request: chat not found"
**Symptoms:** Chat ID exists but message fails
**Cause:** User blocked the bot or chat ID is invalid

**Debug Steps:**
1. Test with a known working chat ID:
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "test_telegram_send", "telegramChatId": "YOUR_CHAT_ID"}'
   ```

2. Ask freelancer to:
   - Unblock the bot if blocked
   - Start a new conversation with the bot
   - Use `/start` command

### Issue 4: Field Name Mismatch
**Symptoms:** Code looks correct but no Telegram data found
**Cause:** Using wrong field name (`telegram_user_id` vs `telegram_chat_id`)

**Solution:** ✅ Fixed! Now using correct field name `telegram_chat_id`

## Environment Variables Required

```bash
# Telegram Bot Token (required)
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# App URL (for links in messages)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## Database Schema Check

The freelancer must have a `telegram_chat_id` in the users table:

```sql
SELECT id, email, username, telegram_chat_id 
FROM users 
WHERE id = 'FREELANCER_ID';
```

Expected result:
- `telegram_chat_id` should be a number (not null)
- This is the chat ID from Telegram, not the user ID

## Step-by-Step Debugging Process

1. **Verify Bot Token**
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "check_bot_token"}'
   ```

2. **Check Freelancer Has Telegram**
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "check_freelancer_telegram", "freelancerId": "ID"}'
   ```

3. **Test Direct Telegram Send**
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "test_telegram_send", "telegramChatId": "CHAT_ID"}'
   ```

4. **Test Full Contract Approval**
   ```bash
   curl -X POST "localhost:3000/api/test-contract-approval" \
     -d '{"action": "test_approval", "contractId": "CONTRACT_ID"}'
   ```

5. **Check Server Logs**
   Look for these messages:
   - ✅ "Telegram notification sent to freelancer successfully"
   - ❌ "Failed to send Telegram notification"
   - ❌ "No Telegram chat ID found for freelancer"

## Success Criteria

After contract approval, you should see:

1. **Server Logs:**
   ```
   Sending notifications to freelancer: {
     freelancerId: "uuid",
     freelancerEmail: "email@example.com", 
     telegramChatId: "123456789"
   }
   Email notification sent to freelancer successfully
   Telegram notification sent to freelancer successfully
   ```

2. **Freelancer Receives:**
   - Email notification ✅
   - Telegram message ✅

3. **Telegram Message Content:**
   ```
   🎉 Contract Approved!
   
   Hello! Great news!
   
   📋 Contract: "Project Name"
   💰 Value: 1000 USDC
   ✅ Status: Approved by client
   
   What's next:
   • Invoices have been generated and sent to the client
   • You'll get payment notifications when they pay
   • Focus on delivering great work!
   
   Keep up the excellent work! 🚀
   ```

## Troubleshooting Checklist

- [ ] `TELEGRAM_BOT_TOKEN` environment variable is set
- [ ] Bot token is valid (test with check_bot_token)
- [ ] Freelancer has `telegram_chat_id` in database
- [ ] Freelancer hasn't blocked the bot
- [ ] Bot has permission to send messages to the user
- [ ] Network connectivity to Telegram API is working
- [ ] Server logs show successful Telegram API calls

## Manual Testing

1. Find a freelancer with Telegram:
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "list_users_with_telegram"}'
   ```

2. Test notification to that freelancer:
   ```bash
   curl -X POST "localhost:3000/api/test-telegram-notification" \
     -d '{"action": "test_telegram_send", "telegramChatId": "THEIR_CHAT_ID"}'
   ```

3. If that works, test full contract approval flow with a contract from that freelancer.