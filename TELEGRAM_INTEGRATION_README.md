# Telegram Integration - Backward Compatibility Guide

## Overview

The Telegram integration has been designed to maintain full backward compatibility with existing WhatsApp users. Your existing account, wallet, and all data will remain intact and functional.

## Database Schema Changes

### New Columns Added to `users` Table

The following columns have been added to support Telegram users:

- `telegram_chat_id` (BIGINT, UNIQUE) - Telegram chat ID for bot interactions
- `telegram_username` (VARCHAR(255)) - Telegram username (without @)
- `telegram_first_name` (VARCHAR(255)) - Telegram user first name
- `telegram_last_name` (VARCHAR(255)) - Telegram user last name
- `telegram_language_code` (VARCHAR(10)) - Telegram user language code

### Backward Compatibility

✅ **Existing WhatsApp users are fully preserved:**

1. **Phone Numbers**: All existing `phone_number` entries remain unchanged
2. **User IDs**: All existing UUID-based user IDs are preserved
3. **Wallets**: All wallet data linked to existing users remains functional
4. **Transaction History**: All payment and transaction history is preserved
5. **User Preferences**: All existing user settings and preferences are maintained

### New Tables

Two new tables have been created specifically for Telegram functionality:

1. **`telegram_sessions`** - Manages Telegram bot sessions
2. **`telegram_message_logs`** - Logs all Telegram bot interactions

These tables do not affect existing WhatsApp functionality.

### User Identification Strategy

- **WhatsApp Users**: Continue to use phone numbers as primary identification
- **Telegram Users**: Use `telegram_chat_id` with a placeholder phone number format: `telegram_{chat_id}`
- **Dual Users**: Users can potentially use both WhatsApp and Telegram with the same account

## Migration Instructions

### Option 1: Manual SQL Execution (Recommended)

1. Open your Supabase SQL Editor
2. Copy and paste the contents of `TELEGRAM_MIGRATION.sql`
3. Execute the migration

### Option 2: Automated Script

```bash
node scripts/run-migrations.js
```

**Note**: Ensure your `.env.local` file contains:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Testing Your Existing Account

After migration, you can verify your existing account works by:

1. **Web Interface**: Access the web interface and check your wallet balance
2. **WhatsApp**: If you were using WhatsApp integration, it should continue working
3. **API Endpoints**: All existing API endpoints remain functional

## New Telegram Features

- **Multi-platform Support**: Users can now interact via both WhatsApp and Telegram
- **Enhanced Logging**: All Telegram interactions are logged for better debugging
- **Session Management**: Telegram sessions are managed separately from WhatsApp
- **User Preferences**: Telegram-specific user preferences (language, username)

## Troubleshooting

### If Your Existing Data Seems Missing

1. Check that the migration was applied successfully
2. Verify your user ID hasn't changed
3. Ensure the `users` table still contains your original phone number

### If Wallet Access Issues

1. Verify the `wallets` table foreign key relationships are intact
2. Check that your `user_id` in the wallets table matches your user record
3. Ensure RLS (Row Level Security) policies are working correctly

## Support

If you encounter any issues with your existing account after the Telegram integration:

1. Check the migration logs for any errors
2. Verify your data integrity using the Supabase dashboard
3. Contact support with your user ID and specific issue details

## Technical Details

### Database Function: `get_or_create_telegram_user`

This function safely creates new Telegram users without affecting existing users:

- Creates placeholder phone numbers for Telegram users
- Links Telegram chat IDs to user records
- Updates user information on subsequent interactions
- Preserves all existing user data

### Row Level Security (RLS)

All new tables include appropriate RLS policies to ensure data security and user privacy.