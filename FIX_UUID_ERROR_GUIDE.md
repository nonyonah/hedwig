# Fix for Database Constraint Errors in Invoices Table

## Problems
1. **UUID Type Error**: The application is trying to insert a Telegram user ID (like "810179883") into a `user_id` column that's expecting a UUID format, causing:
   ```
   invalid input syntax for type uuid: "810179883"
   ```

2. **NOT NULL Constraint Violations**: The application is trying to create draft invoices with null values in required fields, causing:
   ```
   null value in column "freelancer_name" of relation "invoices" violates not-null constraint
   ```

## Root Causes
1. The `invoices` table's `user_id` column is still defined as `uuid` type in the production database, but the application code is trying to store Telegram user IDs (which are text/numbers) in this field.
2. The original table schema has NOT NULL constraints on fields like `freelancer_name`, `client_name`, etc., but the application needs to create draft invoices with incomplete information.

## Solution

The issues are that:
1. The migration file `add_currency_to_invoices.sql` (which correctly defines `user_id` as `text`) hasn't been applied to the production database yet
2. The original table schema has overly strict NOT NULL constraints that prevent creating draft invoices

Here are three ways to fix both issues:

### Option 1: Apply via Supabase Dashboard (Recommended)

1. **Log in to your Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Navigate to "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the Fix Script**
   - Copy the contents of `fix_user_id_uuid_error.sql`
   - Paste into the SQL Editor
   - Click "Run" to execute

4. **Verify the Fix**
   - The script will show you the column type before and after
   - Ensure `user_id` column shows `data_type: text`
   - Verify that draft invoices can be created with incomplete information

### Option 2: Apply Full Migration

If you have access to Supabase CLI and Docker:

```bash
# Make sure Docker Desktop is running
supabase db push
```

**Note**: This only fixes the UUID issue. You'll still need to run the additional SQL commands for the NOT NULL constraints.

### Option 3: Manual SQL Commands

If you prefer to run individual commands:

```sql
-- Check current column type
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'invoices' AND column_name = 'user_id';

-- Fix UUID issue
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
ALTER TABLE invoices ALTER COLUMN user_id TYPE text USING user_id::text;

-- Fix NOT NULL constraints for draft invoices
ALTER TABLE invoices ALTER COLUMN freelancer_name DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN freelancer_email DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN client_name DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN client_email DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN project_description DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN deliverables DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN price DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN wallet_address DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN blockchain DROP NOT NULL;

-- Add conditional constraint to ensure required fields when invoice is sent
ALTER TABLE invoices ADD CONSTRAINT check_required_fields_for_sent_invoices 
CHECK (
    status = 'draft' OR (
        freelancer_name IS NOT NULL AND
        freelancer_email IS NOT NULL AND
        client_name IS NOT NULL AND
        client_email IS NOT NULL AND
        project_description IS NOT NULL AND
        deliverables IS NOT NULL AND
        price IS NOT NULL AND
        amount IS NOT NULL AND
        wallet_address IS NOT NULL AND
        blockchain IS NOT NULL
    )
);

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'invoices' AND column_name = 'user_id';
```

## What This Fix Does

1. **Removes Foreign Key Constraint**: Drops any foreign key reference to `users(id)` since we're storing Telegram user IDs as text
2. **Converts Column Type**: Changes `user_id` from `uuid` to `text` type
3. **Preserves Data**: Safely converts any existing UUID values to text format
4. **Verifies Changes**: Shows before/after column information

## After Applying the Fix

- The invoice creation process should work normally
- Telegram user IDs (like "810179883") will be stored as text
- No more UUID parsing errors

## Files Modified

- ✅ `supabase/migrations/20250130000000_add_currency_to_invoices.sql` - Already updated
- ✅ `src/modules/invoices.ts` - Code is correct (stores user_id as text)

## Prevention

The migration file `20250130000000_add_currency_to_invoices.sql` already contains the correct schema. Make sure to apply all pending migrations to production to prevent similar issues.