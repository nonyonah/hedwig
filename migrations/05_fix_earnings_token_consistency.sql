-- Fix earnings token consistency across all tables
-- This migration ensures all earnings-related tables have consistent token/currency data

-- 1. Fix payments table - ensure currency field is properly set
-- Update NULL or empty currency values to use the default 'ETH'
UPDATE public.payments 
SET currency = 'ETH' 
WHERE currency IS NULL OR currency = '';

-- 2. Fix invoices table - ensure currency/token consistency
-- Add token column to invoices if it doesn't exist (for consistency)
DO $
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'token') THEN
        ALTER TABLE public.invoices ADD COLUMN token varchar(10);
    END IF;
END $;

-- Update token field in invoices to match currency
UPDATE public.invoices 
SET token = COALESCE(currency, 'USD')
WHERE token IS NULL OR token = '';

-- 3. Fix payment_links table - ensure token field is properly set
UPDATE public.payment_links 
SET token = 'USDC' 
WHERE token IS NULL OR token = '';

-- 4. Fix offramp_transactions table - ensure token field is properly set
UPDATE public.offramp_transactions 
SET token = 'USDC' 
WHERE token IS NULL OR token = '';

-- 5. Add network/chain consistency
-- Standardize network names across all tables

-- Update payments table chain values
UPDATE public.payments 
SET chain = CASE 
    WHEN chain IN ('BASE_MAINNET', 'base-mainnet', 'BASE', 'base_mainnet') THEN 'base'
    WHEN chain IN ('CELO_MAINNET', 'celo-mainnet', 'CELO', 'celo_mainnet') THEN 'celo'
    WHEN chain IN ('LISK_MAINNET', 'lisk-mainnet', 'LISK', 'lisk_mainnet') THEN 'lisk'
    WHEN chain IN ('SOLANA_MAINNET', 'solana-mainnet', 'SOLANA', 'solana_mainnet') THEN 'solana'
    WHEN chain IN ('ETHEREUM_MAINNET', 'ethereum-mainnet', 'ETHEREUM', 'ethereum_mainnet', 'ETH_MAINNET') THEN 'ethereum'
    ELSE LOWER(chain)
END
WHERE chain IS NOT NULL;

-- Add network column to invoices if it doesn't exist
DO $
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'network') THEN
        ALTER TABLE public.invoices ADD COLUMN network varchar(50);
    END IF;
END $;

-- Update invoices network based on blockchain field or set default
UPDATE public.invoices 
SET network = CASE 
    WHEN blockchain IN ('BASE_MAINNET', 'base-mainnet', 'BASE', 'base_mainnet') THEN 'base'
    WHEN blockchain IN ('CELO_MAINNET', 'celo-mainnet', 'CELO', 'celo_mainnet') THEN 'celo'
    WHEN blockchain IN ('LISK_MAINNET', 'lisk-mainnet', 'LISK', 'lisk_mainnet') THEN 'lisk'
    WHEN blockchain IN ('SOLANA_MAINNET', 'solana-mainnet', 'SOLANA', 'solana_mainnet') THEN 'solana'
    WHEN blockchain IN ('ETHEREUM_MAINNET', 'ethereum-mainnet', 'ETHEREUM', 'ethereum_mainnet', 'ETH_MAINNET') THEN 'ethereum'
    WHEN blockchain IS NOT NULL THEN LOWER(blockchain)
    ELSE 'base' -- Default to base network
END
WHERE network IS NULL OR network = '';

-- Update payment_links network values
UPDATE public.payment_links 
SET network = CASE 
    WHEN network IN ('BASE_MAINNET', 'base-mainnet', 'BASE', 'base_mainnet') THEN 'base'
    WHEN network IN ('CELO_MAINNET', 'celo-mainnet', 'CELO', 'celo_mainnet') THEN 'celo'
    WHEN network IN ('LISK_MAINNET', 'lisk-mainnet', 'LISK', 'lisk_mainnet') THEN 'lisk'
    WHEN network IN ('SOLANA_MAINNET', 'solana-mainnet', 'SOLANA', 'solana_mainnet') THEN 'solana'
    WHEN network IN ('ETHEREUM_MAINNET', 'ethereum-mainnet', 'ETHEREUM', 'ethereum_mainnet', 'ETH_MAINNET') THEN 'ethereum'
    WHEN network IS NOT NULL THEN LOWER(network)
    ELSE 'base' -- Default to base network
END;

-- Add network column to offramp_transactions if it doesn't exist
DO $
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'offramp_transactions' AND column_name = 'network') THEN
        ALTER TABLE public.offramp_transactions ADD COLUMN network varchar(50) DEFAULT 'base';
    END IF;
END $;

-- Update offramp_transactions network
UPDATE public.offramp_transactions 
SET network = 'base'
WHERE network IS NULL OR network = '';

-- 6. Create indexes for better performance on token/currency queries
CREATE INDEX IF NOT EXISTS idx_payments_currency_network 
ON public.payments(currency, chain);

CREATE INDEX IF NOT EXISTS idx_invoices_token_network 
ON public.invoices(token, network);

CREATE INDEX IF NOT EXISTS idx_payment_links_token_network 
ON public.payment_links(token, network);

CREATE INDEX IF NOT EXISTS idx_offramp_transactions_token_network 
ON public.offramp_transactions(token, network);

-- 7. Add constraints to ensure data quality
-- Ensure currency/token fields are not empty
ALTER TABLE public.payments 
ADD CONSTRAINT check_payments_currency_not_empty 
CHECK (currency IS NOT NULL AND currency != '');

-- Add comments to document the changes
COMMENT ON TABLE public.payments IS 'Payments table - currency field standardized, defaults to ETH';
COMMENT ON TABLE public.invoices IS 'Invoices table - token and network fields added for consistency';
COMMENT ON TABLE public.payment_links IS 'Payment links table - token and network fields standardized';
COMMENT ON TABLE public.offramp_transactions IS 'Offramp transactions table - token and network fields standardized';

-- 8. Create a view for unified earnings data
CREATE OR REPLACE VIEW public.unified_earnings AS
SELECT 
    'payment' as source_type,
    id,
    amount_paid as amount,
    currency as token,
    chain as network,
    status,
    created_at,
    updated_at,
    tx_hash as transaction_hash,
    recipient_user_id as user_id,
    'Direct Transfer' as title,
    CONCAT('Transaction: ', COALESCE(tx_hash, 'N/A')) as description
FROM public.payments
WHERE status = 'completed'

UNION ALL

SELECT 
    'invoice' as source_type,
    id,
    amount,
    COALESCE(token, currency, 'USD') as token,
    COALESCE(network, blockchain, 'base') as network,
    status,
    created_at,
    updated_at,
    NULL as transaction_hash,
    user_id,
    COALESCE(project_description, 'Invoice Payment') as title,
    COALESCE(additional_notes, '') as description
FROM public.invoices
WHERE status = 'paid'

UNION ALL

SELECT 
    'payment_link' as source_type,
    id,
    amount,
    token,
    network,
    status,
    created_at,
    updated_at,
    NULL as transaction_hash,
    created_by as user_id,
    COALESCE(title, 'Payment Link') as title,
    COALESCE(description, '') as description
FROM public.payment_links
WHERE status = 'paid'

UNION ALL

SELECT 
    'offramp' as source_type,
    id,
    amount,
    token,
    network,
    status,
    created_at,
    updated_at,
    tx_hash as transaction_hash,
    user_id,
    'Crypto Withdrawal' as title,
    CONCAT('Offramp to ', COALESCE(fiat_currency, 'USD')) as description
FROM public.offramp_transactions
WHERE status IN ('completed', 'success', 'fulfilled', 'settled', 'delivered');

COMMENT ON VIEW public.unified_earnings IS 'Unified view of all earnings data with consistent token and network fields';

-- Log the migration completion
INSERT INTO public.migration_log (migration_name, completed_at, description) 
VALUES (
    '05_fix_earnings_token_consistency', 
    NOW(), 
    'Fixed token/currency consistency across all earnings tables and created unified earnings view'
) ON CONFLICT (migration_name) DO NOTHING;

-- Create a diagnostic query to show the token distribution after the fix
-- This can be run manually to verify the migration worked correctly
/*
SELECT 
    source_type,
    token,
    network,
    COUNT(*) as count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount
FROM public.unified_earnings 
GROUP BY source_type, token, network
ORDER BY source_type, count DESC;
*/