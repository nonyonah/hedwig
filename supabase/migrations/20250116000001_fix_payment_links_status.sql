-- Fix payment_links status constraint to include 'completed' status
-- This migration adds 'completed' as a valid status for payment_links table

-- Drop the existing constraint if it exists
ALTER TABLE payment_links DROP CONSTRAINT IF EXISTS payment_links_status_check;

-- Add the updated constraint with 'completed' status
ALTER TABLE payment_links ADD CONSTRAINT payment_links_status_check 
  CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'completed'));

-- Add comment for clarity
COMMENT ON CONSTRAINT payment_links_status_check ON payment_links IS 'Ensures status is one of: pending, paid, expired, cancelled, completed';