-- Create the pending_transactions table for transaction storage
CREATE TABLE IF NOT EXISTS public.pending_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id varchar(255) UNIQUE NOT NULL,
    user_id text NOT NULL,
    from_address varchar(255) NOT NULL,
    to_address varchar(255) NOT NULL,
    amount decimal(20, 8) NOT NULL,
    token_symbol varchar(10) NOT NULL,
    token_address varchar(255),
    network varchar(50) NOT NULL,
    status varchar(50) DEFAULT 'pending',
    transaction_hash varchar(255),
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pending_transactions_transaction_id 
ON public.pending_transactions(transaction_id);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_user_id 
ON public.pending_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_status 
ON public.pending_transactions(status);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_expires_at 
ON public.pending_transactions(expires_at);

-- Add trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER handle_pending_transactions_updated_at
    BEFORE UPDATE ON public.pending_transactions
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Enable RLS on the table
ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Service role can manage all pending transactions"
    ON public.pending_transactions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Add comments to document the columns
COMMENT ON TABLE public.pending_transactions IS 'Stores pending transaction records with TTL';
COMMENT ON COLUMN public.pending_transactions.id IS 'Unique database identifier';
COMMENT ON COLUMN public.pending_transactions.transaction_id IS 'Unique transaction identifier used by the application';
COMMENT ON COLUMN public.pending_transactions.user_id IS 'Reference to the user who initiated the transaction';
COMMENT ON COLUMN public.pending_transactions.from_address IS 'Source wallet address';
COMMENT ON COLUMN public.pending_transactions.to_address IS 'Destination wallet address';
COMMENT ON COLUMN public.pending_transactions.amount IS 'Transaction amount';
COMMENT ON COLUMN public.pending_transactions.token_symbol IS 'Token symbol (e.g., ETH, USDC, SOL)';
COMMENT ON COLUMN public.pending_transactions.token_address IS 'Token contract address (null for native tokens)';
COMMENT ON COLUMN public.pending_transactions.network IS 'Blockchain network (e.g., ethereum, polygon, solana)';
COMMENT ON COLUMN public.pending_transactions.status IS 'Transaction status (pending, completed, failed, expired)';
COMMENT ON COLUMN public.pending_transactions.transaction_hash IS 'Blockchain transaction hash when completed';
COMMENT ON COLUMN public.pending_transactions.error_message IS 'Error message if transaction failed';
COMMENT ON COLUMN public.pending_transactions.metadata IS 'Additional transaction metadata as JSON';
COMMENT ON COLUMN public.pending_transactions.expires_at IS 'When the transaction expires and should be cleaned up';