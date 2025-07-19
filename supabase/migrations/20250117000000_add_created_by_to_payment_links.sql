-- Add created_by column to payment_links table
ALTER TABLE public.payment_links 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

-- Create index for better performance on created_by queries
CREATE INDEX IF NOT EXISTS idx_payment_links_created_by ON public.payment_links(created_by);

-- Add comment to explain the column
COMMENT ON COLUMN public.payment_links.created_by IS 'References the user who created this payment link';