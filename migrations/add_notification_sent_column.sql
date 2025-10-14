-- Add notification_sent column to payments table to prevent duplicate notifications
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash_notification ON payments(tx_hash, notification_sent);

-- Update existing records to mark them as notification sent (assuming they were already processed)
UPDATE payments SET notification_sent = TRUE WHERE tx_hash IS NOT NULL AND created_at < NOW();