# Database Column Reference Fix

## Issue Fixed:
**Error**: `column users.telegram_id does not exist`

## Root Cause:
The `src/lib/cdp.ts` file was trying to select `telegram_id` from the users table, but the actual column name in the database is `telegram_chat_id`.

## Error Details:
```
[CDP] Failed to get user details for account name: {
  code: '42703',
  details: null,
  hint: null,
  message: 'column users.telegram_id does not exist'
}
```

## Changes Made:

### In `src/lib/cdp.ts`:

1. **Fixed column selection in user query**:
   ```typescript
   // Before:
   let userQuery = supabase.from('users').select('phone_number, telegram_username, telegram_id, id');
   
   // After:
   let userQuery = supabase.from('users').select('phone_number, telegram_username, telegram_chat_id, id');
   ```

2. **Fixed column reference in account name logic**:
   ```typescript
   // Before:
   } else if (user.telegram_id) {
     accountName = `telegram${user.telegram_id}`;
   
   // After:
   } else if (user.telegram_chat_id) {
     accountName = `telegram${user.telegram_chat_id}`;
   ```

3. **Fixed second occurrence in transfer function**:
   ```typescript
   // Before:
   .select('phone_number, telegram_username, telegram_id')
   
   // After:
   .select('phone_number, telegram_username, telegram_chat_id')
   ```

4. **Updated comments for clarity**:
   ```typescript
   // Before: Priority: telegram_username > telegram_id > phone_number
   // After: Priority: telegram_username > telegram_chat_id > phone_number
   ```

## Database Schema Confirmation:
The correct column name is `telegram_chat_id` as confirmed by multiple references throughout the codebase in:
- `src/modules/bot-integration.ts`
- `src/modules/invoices.ts`
- `src/modules/proposals.ts`
- `src/api/actions.ts`

## Expected Result:
- Native token transfers should now work without the database column error
- User details lookup for wallet operations should succeed
- CDP wallet operations should function properly

## Note:
The `telegram_id` reference in `src/lib/userIdentification.ts` was left unchanged as it refers to the Telegram API user ID, not the database column.