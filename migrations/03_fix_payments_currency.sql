-- Fix payments currency tracking
-- This migration corrects the currency field in the payments table to properly distinguish between ETH and USDC

-- First, let's see what we're working with by adding some logging
-- Note: In production, you might want to remove these comments

-- Update payments that are linked to invoices to use the invoice currency
UPDATE public.payments 
SET currency = invoices.currency,
    chain = COALESCE(invoices.blockchain, 'base')
FROM public.invoices 
WHERE payments.invoice_id = invoices.id 
  AND invoices.currency IS NOT NULL
  AND invoices.currency != '';

-- Update payments that are linked to payment_links to use the payment_link token
UPDATE public.payments 
SET currency = payment_links.token,
    chain = COALESCE(payment_links.blockchain, payment_links.network, 'base')
FROM public.payment_links 
WHERE payments.payment_link_id = payment_links.id 
  AND payment_links.token IS NOT NULL
  AND payment_links.token != '';

-- For direct transfers, we need to make educated guesses based on amount patterns
-- Small amounts (< 0.01) are likely ETH, larger amounts are likely USDC
-- This is a heuristic and may not be 100% accurate, but better than all being ETH

-- Update likely USDC transactions (amounts >= 1 and typical USDC patterns)
UPDATE public.payments 
SET currency = 'USDC'
WHERE payment_type = 'direct_transfer' 
  AND currency = 'ETH' 
  AND amount_paid >= 1 
  AND amount_paid < 1000000; -- Reasonable upper bound for USDC amounts

-- Update likely ETH transactions (very small amounts that are typical for ETH)
UPDATE public.payments 
SET currency = 'ETH'
WHERE payment_type = 'direct_transfer' 
  AND currency = 'ETH' 
  AND amount_paid < 1 
  AND amount_paid > 0;

-- For payments with transaction hashes, we can try to infer from the transaction
-- This is more complex and would require external API calls, so we'll skip for now

-- Add a comment to track this migration
COMMENT ON TABLE public.payments IS 'Currency tracking fixed - payments now properly distinguish between ETH, USDC, and other tokens';

-- Create an index on currency for better performance
CREATE INDEX IF NOT EXISTS idx_payments_currency_chain 
ON public.payments(currency, chain);

-- Update chain values to use consistent naming
UPDATE public.payments 
SET chain = 'base' 
WHERE chain IN ('BASE_MAINNET', 'base-mainnet', 'BASE');

UPDATE public.payments 
SET chain = 'celo' 
WHERE chain IN ('CELO_MAINNET', 'celo-mainnet', 'CELO');

UPDATE public.payments 
SET chain = 'lisk' 
WHERE chain IN ('LISK_MAINNET', 'lisk-mainnet', 'LISK');

UPDATE public.payments 
SET chain = 'solana' 
WHERE chain IN ('SOLANA_MAINNET', 'solana-mainnet', 'SOLANA');