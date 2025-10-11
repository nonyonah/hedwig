-- Create the onramp_transactions table for Fonbnk integration
-- This table stores fiat-to-crypto purchase transactions

-- Drop existing table if it exists to avoid constraint issues
DROP TABLE IF EXISTS public.onramp_transactions CASCADE;

-- Create the onramp_transactions table
CREATE TABLE IF NOT EXISTS public.onramp_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,
    fonbnk_transaction_id varchar(255) UNIQUE,
    token varchar(10) NOT NULL,
    chain varchar(20) NOT NULL,
    amount decimal(20, 8) NOT NULL,
    fiat_amount decimal(20, 2) NOT NULL,
    fiat_currency varchar(3) NOT NULL,
    wallet_address varchar(255) NOT NULL,
    status varchar(50) DEFAULT 'pending',
    tx_hash varchar(255),
    error_message text,
    error_step varchar(100),
    fonbnk_payment_url text,
    expires_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_onramp_transactions_fonbnk_id 
ON public.onramp_transactions(fonbnk_transaction_id);

CREATE INDEX IF NOT EXISTS idx_onramp_transactions_user_id 
ON public.onramp_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_onramp_transactions_status 
ON public.onramp_transactions(status);

CREATE INDEX IF NOT EXISTS idx_onramp_transactions_created_at 
ON public.onramp_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onramp_transactions_user_status 
ON public.onramp_transactions(user_id, status);

-- Add trigger for updated_at timestamps (reuse existing function)
CREATE TRIGGER handle_onramp_transactions_updated_at
    BEFORE UPDATE ON public.onramp_transactions
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Enable RLS on the table
ALTER TABLE public.onramp_transactions ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Service role can manage all onramp transactions"
    ON public.onramp_transactions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Add comments to document the columns
COMMENT ON TABLE public.onramp_transactions IS 'Stores onramp (fiat-to-crypto) transaction records from Fonbnk';
COMMENT ON COLUMN public.onramp_transactions.id IS 'Unique transaction identifier';
COMMENT ON COLUMN public.onramp_transactions.user_id IS 'Reference to the user who initiated the transaction';
COMMENT ON COLUMN public.onramp_transactions.fonbnk_transaction_id IS 'Fonbnk transaction ID for tracking';
COMMENT ON COLUMN public.onramp_transactions.token IS 'Token symbol (USDC, USDT, cUSD)';
COMMENT ON COLUMN public.onramp_transactions.chain IS 'Blockchain network (solana, base, celo, lisk)';
COMMENT ON COLUMN public.onramp_transactions.amount IS 'Amount of crypto tokens to purchase';
COMMENT ON COLUMN public.onramp_transactions.fiat_amount IS 'Amount in fiat currency';
COMMENT ON COLUMN public.onramp_transactions.fiat_currency IS 'Fiat currency code (NGN, KES, etc.)';
COMMENT ON COLUMN public.onramp_transactions.wallet_address IS 'User wallet address to receive tokens';
COMMENT ON COLUMN public.onramp_transactions.status IS 'Transaction status (pending, processing, completed, failed)';
COMMENT ON COLUMN public.onramp_transactions.tx_hash IS 'Blockchain transaction hash when completed';
COMMENT ON COLUMN public.onramp_transactions.error_message IS 'Error message if transaction failed';
COMMENT ON COLUMN public.onramp_transactions.error_step IS 'Step where error occurred';
COMMENT ON COLUMN public.onramp_transactions.fonbnk_payment_url IS 'Fonbnk payment URL for user to complete payment';
COMMENT ON COLUMN public.onramp_transactions.expires_at IS 'When the transaction expires';
COMMENT ON COLUMN public.onramp_transactions.completed_at IS 'When the transaction was completed';