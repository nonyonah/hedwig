-- Add blockchain column to invoices table (immediate fix)
-- This is a minimal migration to fix the current invoice creation issue

-- Add blockchain column to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS blockchain VARCHAR(50);

-- Add blockchain column to payment_links table  
ALTER TABLE payment_links 
ADD COLUMN IF NOT EXISTS blockchain VARCHAR(50);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_blockchain ON invoices(blockchain);
CREATE INDEX IF NOT EXISTS idx_payment_links_blockchain ON payment_links(blockchain);

-- Add comments for documentation
COMMENT ON COLUMN invoices.blockchain IS 'Blockchain network selected during invoice creation (base, celo)';
COMMENT ON COLUMN payment_links.blockchain IS 'Blockchain network selected during payment link creation (base, celo)';

-- Set default blockchain for existing records
UPDATE invoices SET blockchain = 'base' WHERE blockchain IS NULL;
UPDATE payment_links SET blockchain = 'base' WHERE blockchain IS NULL;