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
- ✅ Fixed 405 Method Not Allowed error with better URL construction
- ✅ Added environment-aware URL routing for internal webhook calls

### 5. Transaction Storage (`src/lib/transactionStorage.ts`)
- ✅ Fixed cleanup error handling to prevent interval crashes
- ✅ Improved error logging with detailed error information
- ✅ Added resilient cleanup interval with duplicate prevention
- ✅ Enhanced cleanup to handle both failed/expired and old transactions

### 6. Paycrest Webhook (`src/pages/api/webhooks/paycrest.ts`)
- ✅ Fixed webhook payload structure to match actual Paycrest format
- ✅ Fixed signature verification using correct HMAC-SHA256 format
- ✅ Improved error handling and logging with detailed signature verification
- ✅ Added proper response format for Paycrest

### 7. Paycrest Service (`src/services/serverPaycrestService.ts`)
- ✅ Fixed API endpoint from `/orders/` to `/sender/orders/` 
- ✅ Fixed authentication header from `Authorization: Bearer` to `API-Key`
- ✅ Added proper error logging for API calls
- ✅ Enhanced order status monitoring

### 8. Smart Nudge/Reminder System (`src/lib/smartNudgeService.ts`)
- ✅ Fixed complex Supabase query logic that was preventing nudges from being found
- ✅ Simplified target selection with clear time-based logic
- ✅ Added detailed logging for debugging nudge eligibility
- ✅ Created automated scheduler (`src/lib/nudgeScheduler.ts`) to run nudges every 6 hours
- ✅ Fixed timing calculations for nudge intervals

## New Files Created

### 1. Test Files
- `src/pages/api/test-telegram.ts` - Test Telegram bot functionality
- `src/scripts/test-webhook-flow.ts` - Test webhook notification flow
- `src/pages/api/debug-users.ts` - Debug user and Telegram data
- `src/pages/api/debug-env.ts` - Debug environment variables
- `src/pages/api/debug-cleanup.ts` - Manual transaction cleanup
- `src/pages/api/debug-transactions.ts` - Check transaction storage status
- `src/pages/api/debug-paycrest.ts` - Debug Paycrest API calls and environment
- `src/pages/api/test-payment-notification.ts` - Test payment notification webhook
- `src/pages/api/test-nudges.ts` - Test nudge system and see eligible targets
- `src/pages/api/trigger-nudges.ts` - Manually trigger nudge processing
- `src/pages/api/nudge-scheduler.ts` - Manage the automated nudge scheduler

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

### 5. Debug Transaction Storage
```bash
# Check transaction storage status
curl http://localhost:3000/api/debug-transactions

# Manual cleanup
curl -X POST http://localhost:3000/api/debug-cleanup
```

### 6. Debug Paycrest API
```bash
# Check Paycrest environment and API
curl http://localhost:3000/api/debug-paycrest

# Test specific order status (replace with actual order ID)
curl "http://localhost:3000/api/debug-paycrest?orderId=your_order_id"
```

### 7. Test Payment Notifications
```bash
# Test payment notification webhook
curl -X POST http://localhost:3000/api/test-payment-notification \
  -H "Content-Type: application/json" \
  -d '{"testType": "direct_transfer"}'
```

### 8. Test and Manage Nudge System
```bash
# Check what targets are eligible for nudging
curl http://localhost:3000/api/test-nudges

# Test nudge processing (dry run)
curl -X POST http://localhost:3000/api/trigger-nudges \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Actually send nudges
curl -X POST http://localhost:3000/api/trigger-nudges \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Check scheduler status
curl http://localhost:3000/api/nudge-scheduler

# Start/stop scheduler
curl -X POST http://localhost:3000/api/nudge-scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "intervalHours": 6}'
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