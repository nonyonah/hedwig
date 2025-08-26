-- Add payment_transaction column to payment_links table
-- This column is needed to store the transaction hash when a payment link is paid

ALTER TABLE public.payment_links 
ADD COLUMN IF NOT EXISTS payment_transaction VARCHAR(66);

-- Create index for better performance on payment_transaction queries
CREATE INDEX IF NOT EXISTS idx_payment_links_payment_transaction ON public.payment_links(payment_transaction);

-- Add comment to explain the column
COMMENT ON COLUMN public.payment_links.payment_transaction IS 'Transaction hash when the payment link was paid';