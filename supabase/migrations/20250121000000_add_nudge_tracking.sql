-- Add nudge tracking columns to payment_links table
ALTER TABLE public.payment_links 
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Create nudge_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.nudge_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('payment_link')),
    target_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    nudge_type VARCHAR(50) NOT NULL,
    message_sent TEXT,
    sent_via VARCHAR(20) DEFAULT 'whatsapp',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_links_viewed_at ON public.payment_links(viewed_at);
CREATE INDEX IF NOT EXISTS idx_payment_links_nudge_count ON public.payment_links(nudge_count);
CREATE INDEX IF NOT EXISTS idx_payment_links_last_nudge_at ON public.payment_links(last_nudge_at);

CREATE INDEX IF NOT EXISTS idx_nudge_logs_target ON public.nudge_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_user_id ON public.nudge_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_sent_at ON public.nudge_logs(sent_at);

-- Enable RLS on nudge_logs
ALTER TABLE public.nudge_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for nudge_logs
CREATE POLICY "Service role can manage all nudge_logs"
ON public.nudge_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT ALL ON public.nudge_logs TO service_role;

-- Add comment to the table
COMMENT ON TABLE public.nudge_logs IS 'Audit trail for all nudge attempts sent to users';