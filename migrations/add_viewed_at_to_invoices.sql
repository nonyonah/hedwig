-- Add viewed_at column to invoices table for nudging system
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;

-- Add other nudge-related columns if they don't exist
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Add index for better performance on nudging queries
CREATE INDEX IF NOT EXISTS idx_invoices_viewed_at ON invoices(viewed_at);
CREATE INDEX IF NOT EXISTS idx_invoices_created_status ON invoices(date_created, status);
CREATE INDEX IF NOT EXISTS idx_invoices_nudge_count ON invoices(nudge_count);
CREATE INDEX IF NOT EXISTS idx_invoices_nudge_disabled ON invoices(nudge_disabled);

-- Update existing invoices to have viewed_at as date_created (assuming they were viewed when created)
UPDATE invoices SET viewed_at = date_created WHERE viewed_at IS NULL;

-- Initialize nudge_count to 0 for existing records
UPDATE invoices SET nudge_count = 0 WHERE nudge_count IS NULL;

-- Initialize nudge_disabled to false for existing records
UPDATE invoices SET nudge_disabled = FALSE WHERE nudge_disabled IS NULL;