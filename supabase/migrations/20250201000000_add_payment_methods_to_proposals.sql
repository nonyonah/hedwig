-- Add payment_methods column to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS payment_methods jsonb DEFAULT '{}';

-- Update existing proposals to have empty payment_methods object
UPDATE proposals SET payment_methods = '{}' WHERE payment_methods IS NULL;