-- Add viewed_at column to payment_links table for nudging system
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;

-- Add other nudge-related columns if they don't exist
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Add index for better performance on nudging queries
CREATE INDEX IF NOT EXISTS idx_payment_links_viewed_at ON payment_links(viewed_at);
CREATE INDEX IF NOT EXISTS idx_payment_links_created_status ON payment_links(created_at, status);
CREATE INDEX IF NOT EXISTS idx_payment_links_nudge_count ON payment_links(nudge_count);
CREATE INDEX IF NOT EXISTS idx_payment_links_nudge_disabled ON payment_links(nudge_disabled);

-- Update existing payment_links to have viewed_at as created_at (assuming they were viewed when created)
UPDATE payment_links SET viewed_at = created_at WHERE viewed_at IS NULL;

-- Initialize nudge_count to 0 for existing records
UPDATE payment_links SET nudge_count = 0 WHERE nudge_count IS NULL;

-- Initialize nudge_disabled to false for existing records
UPDATE payment_links SET nudge_disabled = FALSE WHERE nudge_disabled IS NULL;