-- Add calendar_event_id column to invoices table
-- This column stores the Google Calendar event ID for invoice due date tracking

-- Add calendar_event_id column to invoices table
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS calendar_event_id text;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_calendar_event_id 
ON public.invoices(calendar_event_id);

-- Add comment for documentation
COMMENT ON COLUMN public.invoices.calendar_event_id IS 'Google Calendar event ID associated with this invoice due date';