-- Migration: Add invoice support to nudge tracking system
-- This migration extends the nudge system to support invoices in addition to payment links

-- Add nudge tracking columns to invoices table
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Update the target_type constraint to include invoices
ALTER TABLE public.nudge_logs 
DROP CONSTRAINT IF EXISTS nudge_logs_target_type_check;

ALTER TABLE public.nudge_logs 
ADD CONSTRAINT nudge_logs_target_type_check 
CHECK (target_type IN ('payment_link', 'invoice'));

-- Create indexes for better performance on invoices table
CREATE INDEX IF NOT EXISTS idx_invoices_viewed_at ON public.invoices(viewed_at);
CREATE INDEX IF NOT EXISTS idx_invoices_nudge_count ON public.invoices(nudge_count);
CREATE INDEX IF NOT EXISTS idx_invoices_last_nudge_at ON public.invoices(last_nudge_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- Add comment
COMMENT ON COLUMN public.invoices.viewed_at IS 'Timestamp when the invoice was first viewed by the recipient';
COMMENT ON COLUMN public.invoices.nudge_count IS 'Number of nudge reminders sent for this invoice';
COMMENT ON COLUMN public.invoices.last_nudge_at IS 'Timestamp of the last nudge reminder sent';
COMMENT ON COLUMN public.invoices.nudge_disabled IS 'Whether nudge reminders are disabled for this invoice';