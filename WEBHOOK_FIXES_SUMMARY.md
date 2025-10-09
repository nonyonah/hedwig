# Webhook Fixes Summary

## Issues Fixed

### 1. Paycrest Offramp Webhook (`src/pages/api/offramp/webhook.ts`)
- ✅ Fixed webhook payload structure to match Paycrest documentation
- ✅ Added proper signature verification using HMAC-SHA256
- ✅ Improved error handling and logging
- ✅ Added proper response format for Paycrest
- ✅ Fixed notification payload structure

### 2. Payment Listener Service (`src/services/payment-listener-startup.ts`)
- ✅ Added duplicate event prevention
- ✅ Improved error handling for database operations
- ✅ Added proper notification sending for all payment types
- ✅ Added event processing status tracking
- ✅ Fixed invoice/proposal/payment_link status updates

### 3. Payment Notifications Webhook (`src/pages/api/webhooks/payment-notifications.ts`)
- ✅ Enhanced logging for debugging Telegram issues
- ✅ Improved bot initialization with error handling
- ✅ Added better error messages for troubleshooting
- ✅ Enhanced direct transfer handling

### 4. Alchemy Webhook (`src/pages/api/webhooks/alchemy.ts`)
- ✅ Enhanced logging for notification debugging
- ✅ Added timeout handling for notification requests
- ✅ Improved error reporting

## New Files Created

### 1. Test Files
- `src/pages/api/test-telegram.ts` - Test Telegram bot functionality
- `src/scripts/test-webhook-flow.ts` - Test webhook notification flow
- `src/pages/api/debug-users.ts` - Debug user and Telegram data

## Environment Variables Fixed

✅ **Fixed**: Renamed `env.local` to `.env.local` (Next.js requires the dot prefix)

Your environment variables are now properly loaded. Key variables verified:
- `TELEGRAM_BOT_TOKEN` ✅ 
- `PAYCREST_API_KEY` ✅
- `PAYCREST_API_SECRET` ⚠️ (currently set to placeholder - update with real value)
- `ALCHEMY_API_KEY` ✅
- All other required variables ✅

## Testing Steps

### 1. Check Environment Variables
```bash
curl http://localhost:3000/api/debug-env
```

### 2. Test Telegram Bot
```bash
curl -X POST http://localhost:3000/api/test-telegram \
  -H "Content-Type: application/json" \
  -d '{"chatId": "YOUR_CHAT_ID", "message": "Test message"}'
```

### 3. Check User Data
```bash
curl http://localhost:3000/api/debug-users
```

### 4. Test Webhook Flow
```bash
npx tsx src/scripts/test-webhook-flow.ts
```

## Common Issues to Check

### 1. Telegram Bot Not Sending Messages
- ✅ Check if `TELEGRAM_BOT_TOKEN` is set correctly
- ✅ Verify users have `telegram_chat_id` in database
- ✅ Check if bot is blocked by user
- ✅ Verify bot has permission to send messages

### 2. Webhook Not Receiving Calls
- ✅ Check webhook URLs are configured correctly in external services
- ✅ Verify signature verification is working
- ✅ Check network connectivity and firewall settings

### 3. Database Issues
- ✅ Run the database migration script
- ✅ Check if all required tables exist
- ✅ Verify RLS policies are set correctly

## Monitoring

Check these logs to monitor webhook health:

1. **Alchemy Webhook**: Look for `🔔 Preparing notification` logs
2. **Payment Notifications**: Look for `📱 Attempting to send Telegram notification` logs
3. **Paycrest Webhook**: Look for `[PaycrestWebhook]` prefixed logs
4. **Payment Listener**: Look for `🔄 Processing payment event` logs

## Next Steps

1. Add the missing environment variables
2. Test the Telegram bot functionality
3. Monitor the webhook logs for any remaining issues
4. Set up proper webhook URLs in external services (Paycrest, Alchemy)