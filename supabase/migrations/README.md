# Supabase Migrations

This directory contains database migrations for the Hedwig project.

## Latest Migration: Add Name to Users Table

The latest migration (`20240705000000_add_name_to_users.sql`) adds a `name` column to the `users` table to store user names from WhatsApp or manually provided names.

### How to Apply This Migration

#### Option 1: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push
```

#### Option 2: Using Supabase Dashboard

1. Log in to your Supabase dashboard
2. Go to the SQL Editor
3. Copy the contents of `20240705000000_add_name_to_users.sql`
4. Paste into the SQL Editor
5. Click "Run" to execute the migration

### What This Migration Does

1. Adds a `name` TEXT column to the `users` table
2. Updates RLS policies to ensure proper access control
3. Creates an index on the `name` column for faster lookups
4. Updates the `get_or_create_user` function to handle names
5. Adds a comment to explain the purpose of the column

### After Migration

After applying this migration, the system will:
- Store WhatsApp profile names automatically
- Allow users to provide their names when asked
- Use names for personalizing wallet creation in BlockRadar

## Previous Migrations

The project includes several previous migrations that set up the initial schema and made various improvements:

- `20240610114100_initial_schema.sql`: Initial database schema
- `20240618_wallet_creation_attempts.sql`: Added wallet creation tracking
- `20240618_fix_wallet_user_id.sql`: Fixed user ID references
- `20240618_wallet_prompts.sql`: Added wallet prompts
- `20240618_fix_rls_policies.sql`: Fixed row-level security policies
- `20240618_add_get_or_create_user_function.sql`: Added user management function
- `20240701000000_add_username_to_wallets.sql`: Added username to wallets
- `20240702000000_fix_wallet_user_validation.sql`: Fixed wallet user validation 