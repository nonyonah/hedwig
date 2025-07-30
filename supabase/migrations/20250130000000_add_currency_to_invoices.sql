-- This migration adds missing columns to the invoices table

-- Add currency column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD' CHECK (currency IN ('USD', 'NGN', 'USDC', 'CNGN'));

-- Add payment_methods column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_methods jsonb DEFAULT '[]';

-- Add user_id column to invoices table (allowing both UUID and text for Telegram user IDs)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id text;

-- Add viewed_at column for tracking when invoice was viewed
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at timestamp with time zone;

-- Add created_at and updated_at columns if they don't exist (using date_created as fallback)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Update existing records to have USD as default currency
UPDATE invoices SET currency = 'USD' WHERE currency IS NULL;

-- Update created_at from date_created if it exists and created_at is null
UPDATE invoices SET created_at = date_created WHERE created_at IS NULL AND date_created IS NOT NULL;

-- Make currency column not null after setting defaults
ALTER TABLE invoices ALTER COLUMN currency SET NOT NULL;

-- Create trigger to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();