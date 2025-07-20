-- Enhance payment_links table for better earnings tracking
-- Add payer_wallet_address to track who made the payment
ALTER TABLE public.payment_links 
ADD COLUMN IF NOT EXISTS payer_wallet_address VARCHAR(42);

-- Add index for payer_wallet_address for earnings queries
CREATE INDEX IF NOT EXISTS idx_payment_links_payer_wallet ON public.payment_links(payer_wallet_address);

-- Add index for paid_at timestamp for time-based queries
CREATE INDEX IF NOT EXISTS idx_payment_links_paid_at ON public.payment_links(paid_at);

-- Add composite index for earnings queries (wallet + status + paid_at)
CREATE INDEX IF NOT EXISTS idx_payment_links_earnings ON public.payment_links(wallet_address, status, paid_at);

-- Add composite index for payer earnings queries
CREATE INDEX IF NOT EXISTS idx_payment_links_payer_earnings ON public.payment_links(payer_wallet_address, status, paid_at);

-- Add comment to explain the new column
COMMENT ON COLUMN public.payment_links.payer_wallet_address IS 'Wallet address of the person who made the payment';

-- Create a view for easier earnings queries
CREATE OR REPLACE VIEW public.earnings_summary AS
SELECT 
    wallet_address as recipient_wallet,
    payer_wallet_address,
    token,
    network,
    paid_amount as amount,
    paid_at as timestamp,
    status,
    transaction_hash,
    payment_reason,
    id as payment_id
FROM public.payment_links
WHERE status = 'paid' AND paid_at IS NOT NULL;

-- Grant access to the view
GRANT SELECT ON public.earnings_summary TO service_role;

-- Add RLS policy for the view
ALTER VIEW public.earnings_summary SET (security_invoker = true);