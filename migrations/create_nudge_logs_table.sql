-- Create nudge_logs table for tracking nudge attempts
CREATE TABLE IF NOT EXISTS nudge_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('payment_link', 'invoice')),
    target_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    nudge_type VARCHAR(50) NOT NULL,
    message_sent TEXT NOT NULL,
    sent_via VARCHAR(20) NOT NULL DEFAULT 'email',
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nudge_logs_target ON nudge_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_user_id ON nudge_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_created_at ON nudge_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_success ON nudge_logs(success);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to nudge_logs table
DROP TRIGGER IF EXISTS update_nudge_logs_updated_at ON nudge_logs;
CREATE TRIGGER update_nudge_logs_updated_at
    BEFORE UPDATE ON nudge_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();