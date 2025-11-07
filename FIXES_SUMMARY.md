# Milestone Payment & Feedback Fixes

## Issues Fixed

### 1. ✅ Database Column Missing
**Error**: `column contract_milestones.invoice_id does not exist`

**Fix**: 
- Created migration file: `supabase/migrations/20240101000016_add_invoice_id_to_milestones.sql`
- Created manual SQL script: `add_invoice_id_column.sql`

**Action Required**:
Run the SQL script in your Supabase SQL Editor:
```bash
# Option 1: Run the migration
npx supabase db push

# Option 2: Run the SQL manually in Supabase Dashboard
# Copy contents of add_invoice_id_column.sql and run in SQL Editor
```

---

### 2. ✅ Feedback Button Showing for Approved Milestones
**Issue**: Feedback button was appearing for both submitted AND approved milestones. It should only appear for submitted milestones.

**Files Changed**:
- `/src/components/ui/ProgressBar.tsx` (lines 320-331)
- `/src/pages/api/milestones/[id]/request-changes.ts` (lines 98-102)

**Changes**:
- Removed feedback button from approved milestones section in ProgressBar
- Updated API validation to only accept submitted/completed status (not approved)

**Result**: Feedback button now only shows when milestone status is 'submitted' or 'completed', not 'approved'

---

### 3. ✅ Telegram Notifications Not Being Received
**Issue**: Freelancers weren't receiving Telegram notifications when feedback was sent

**Files Changed**:
- `/src/pages/api/milestones/[id]/request-changes.ts` (lines 314-373)

**Improvements**:
- Added bot token validation
- Added comprehensive console logging to track:
  - Chat ID being used
  - Message preview
  - API response/errors
- Added better error handling with detailed error messages
- Parse Telegram API response to show exact error

**Debugging**: Check server logs for these messages:
```
[Request Changes] Sending Telegram notification to: <chat_id>
[Telegram] Sending message to chat_id: <chat_id>
[Telegram] Message preview: ...
[Telegram] Message sent successfully: {...}
```

**Common Issues to Check**:
1. Verify `TELEGRAM_BOT_TOKEN` is set in `.env.local`
2. Verify freelancer has `telegram_chat_id` in database
3. Check if bot is blocked by user
4. Verify bot has permission to send messages

---

## Testing Instructions

### Test 1: Payment Button Visibility
1. Connect as client (any wallet except freelancer's)
2. Navigate to contract with approved milestone
3. ✅ Should see "💰 Generate Invoice & Pay" button
4. ✅ Should NOT see "💬 Send Feedback" button

### Test 2: Feedback Button (Submitted Milestone)
1. Connect as client
2. Navigate to contract with submitted milestone
3. ✅ Should see both "✅ Approve Milestone" and "💬 Send Feedback" buttons
4. Click "💬 Send Feedback"
5. Enter feedback text
6. ✅ Freelancer should receive Telegram notification
7. ✅ Check server logs for Telegram success message

### Test 3: Invoice Generation
1. Connect as client
2. Click "💰 Generate Invoice & Pay" on approved milestone
3. ✅ Should redirect to `/invoice/[id]` page
4. ✅ Invoice should be created in database
5. ✅ Check server logs for:
   ```
   [Initiate Payment] Starting payment initiation for milestone: ...
   [Initiate Payment] Milestone found: ...
   [Initiate Payment] Invoice created: ...
   [Initiate Payment] Payment initiation successful, redirecting to: ...
   ```

---

## Files Modified

### Frontend
- `/src/pages/contracts/[id].tsx`
  - Fixed isClient/isFreelancer logic (lines 306-312)
  - Added debug logging (lines 77-87)

- `/src/components/ui/ProgressBar.tsx`
  - Removed feedback button from approved milestones (lines 320-331)

### Backend
- `/src/pages/api/milestones/[id]/initiate-payment.ts`
  - Fixed invoice generation to use correct table
  - Added freelancer wallet validation
  - Added comprehensive logging

- `/src/pages/api/milestones/[id]/request-changes.ts`
  - Restricted feedback to submitted/completed only
  - Enhanced Telegram notification with logging
  - Added bot token validation

### Database
- `supabase/migrations/20240101000016_add_invoice_id_to_milestones.sql` (NEW)
- `add_invoice_id_column.sql` (NEW - manual script)

---

## Next Steps

1. **REQUIRED**: Run the database migration to add `invoice_id` column:
   ```sql
   -- Run in Supabase SQL Editor
   ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS invoice_id UUID;
   CREATE INDEX IF NOT EXISTS idx_contract_milestones_invoice_id ON contract_milestones(invoice_id);
   ```

2. Restart the dev server to pick up changes:
   ```bash
   npm run dev
   ```

3. Test all three scenarios above

4. Monitor server logs for any errors

5. If Telegram notifications still don't work, check:
   - Environment variable `TELEGRAM_BOT_TOKEN` is set
   - Freelancer has valid `telegram_chat_id` in users table
   - Bot is not blocked by user

---

## Logs to Watch For

### Success Logs
```
[Initiate Payment] Starting payment initiation for milestone: ...
[Initiate Payment] Invoice created: ...
[Request Changes] Sending Telegram notification to: ...
[Telegram] Message sent successfully: ...
```

### Error Logs
```
[Initiate Payment] Milestone not found: ...
[Telegram] TELEGRAM_BOT_TOKEN not configured
[Telegram] API error response: ...
```
