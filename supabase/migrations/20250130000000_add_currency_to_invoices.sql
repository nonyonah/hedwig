-- Add currency column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD' CHECK (currency IN ('USD', 'NGN', 'USDC', 'CNGN'));

-- Add payment_methods column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_methods jsonb DEFAULT '[]';

-- Update existing records to have USD as default currency
UPDATE invoices SET currency = 'USD' WHERE currency IS NULL;

-- Make currency column not null after setting defaults
ALTER TABLE invoices ALTER COLUMN currency SET NOT NULL;