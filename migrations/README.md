# Database Migrations

This directory contains all database migration scripts for the Hedwig Bot project.

## Migration Files

### Smart Nudging System
- `00_setup_nudging_system_complete.sql` - **RECOMMENDED** Complete setup for nudging system
- `01_create_nudge_logs_table_final.sql` - Creates nudge_logs table with error handling
- `setup_nudging_system_fixed.sql` - Alternative comprehensive setup
- `fix_invoices_users_relationship.sql` - Fixes user_id type conversion issue
- `add_viewed_at_to_invoices.sql` - Adds nudge columns to invoices table
- `add_viewed_at_to_payment_links.sql` - Adds nudge columns to payment_links table
- `create_nudge_logs_table.sql` - Basic nudge_logs table creation
- `create_nudge_logs_table_simple.sql` - Simple version without triggers

### Other Features
- `create_google_calendar_credentials_table.sql` - Google Calendar integration
- `create_onramp_transactions_table.sql` - Onramp transaction tracking
- `add_blockchain_column_to_invoices.sql` - Blockchain support for invoices
- `add_calendar_event_id_to_invoices.sql` - Calendar integration for invoices
- `add_network_support_to_payment_events.sql` - Multi-network payment support

## Usage

### Quick Setup (Recommended)
Run the complete nudging system setup:
```sql
\i migrations/00_setup_nudging_system_complete.sql
```

### Individual Migrations
If you prefer to run migrations individually:
```sql
\i migrations/fix_invoices_users_relationship.sql
\i migrations/add_viewed_at_to_invoices.sql
\i migrations/add_viewed_at_to_payment_links.sql
\i migrations/01_create_nudge_logs_table_final.sql
```

### Troubleshooting

#### Error: "column created_at does not exist"
This error has been fixed in the latest migration files. Use:
- `00_setup_nudging_system_complete.sql` (recommended)
- `01_create_nudge_logs_table_final.sql` (for nudge_logs only)

#### Error: "foreign key constraint cannot be implemented"
This happens when `user_id` column types don't match. The complete setup script handles this automatically.

#### Error: "function already exists"
Some migrations create functions that might already exist. The scripts use `CREATE OR REPLACE` to handle this.

## Migration Order

1. **User relationship fixes** - Fix foreign key constraints
2. **Column additions** - Add missing columns for nudging
3. **Table creation** - Create new tables like nudge_logs
4. **Index creation** - Add performance indexes
5. **Data initialization** - Set default values for existing records

## Verification

After running migrations, verify the setup:
```sql
-- Check if all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('nudge_logs', 'invoices', 'payment_links');

-- Check if all columns exist
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('invoices', 'payment_links', 'nudge_logs')
  AND column_name IN ('viewed_at', 'nudge_count', 'last_nudge_at', 'nudge_disabled', 'user_id')
ORDER BY table_name, column_name;

-- Check foreign key constraints
SELECT constraint_name, table_name, column_name 
FROM information_schema.key_column_usage 
WHERE constraint_name LIKE '%user_id_fkey%';
```