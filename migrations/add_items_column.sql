-- Add items column to invoices table for storing multiple invoice items
-- This migration adds support for multi-item invoices while maintaining backward compatibility

-- Add the items column as JSONB to store an array of invoice items
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

-- Create a GIN index for better query performance on the items column
CREATE INDEX IF NOT EXISTS idx_invoices_items ON invoices USING GIN(items);

-- Add a comment to document the new column
COMMENT ON COLUMN invoices.items IS 'JSON array of invoice items with description, quantity, rate, and amount';

-- Migration notes:
-- 1. Existing invoices will have an empty items array by default
-- 2. The existing single-item fields (quantity, rate, amount) are preserved for backward compatibility
-- 3. New invoices will populate both the items array and maintain single-item fields for compatibility
-- 4. Frontend and API have been updated to handle both formats

-- Example items array structure:
-- [
--   {
--     "description": "Web Development",
--     "quantity": 10,
--     "rate": 50.00,
--     "amount": 500.00
--   },
--   {
--     "description": "Design Services",
--     "quantity": 5,
--     "rate": 40.00,
--     "amount": 200.00
--   }
-- ]