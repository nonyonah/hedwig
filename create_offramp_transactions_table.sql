-- Drop existing table if it exists to avoid constraint issues
DROP TABLE IF EXISTS public.offramp_transactions CASCADE;

-- Create the offramp_transactions table
CREATE TABLE IF NOT EXISTS public.offramp_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,
    paycrest_order_id varchar(255),
    amount decimal(20, 8) NOT NULL,
    token varchar(10) NOT NULL,
    fiat_amount decimal(20, 2),
    fiat_currency varchar(3),
    bank_details jsonb,
    status varchar(50) DEFAULT 'pending',
    receive_address varchar(255),
    tx_hash varchar(255),
    gateway_id varchar(255),
    error_message text,
    error_step varchar(100),
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_paycrest_order_id 
ON public.offramp_transactions(paycrest_order_id);

CREATE INDEX IF NOT EXISTS idx_offramp_transactions_user_id 
ON public.offramp_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_offramp_transactions_status 
ON public.offramp_transactions(status);

-- Add trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER handle_offramp_transactions_updated_at
    BEFORE UPDATE ON public.offramp_transactions
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Enable RLS on the table
ALTER TABLE public.offramp_transactions ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Service role can manage all offramp transactions"
    ON public.offramp_transactions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Add comments to document the columns
COMMENT ON TABLE public.offramp_transactions IS 'Stores offramp transaction records';
COMMENT ON COLUMN public.offramp_transactions.id IS 'Unique transaction identifier';
COMMENT ON COLUMN public.offramp_transactions.user_id IS 'Reference to the user who initiated the transaction';
COMMENT ON COLUMN public.offramp_transactions.paycrest_order_id IS 'Paycrest order ID for tracking the transaction';
COMMENT ON COLUMN public.offramp_transactions.receive_address IS 'Blockchain address where tokens should be sent';
COMMENT ON COLUMN public.offramp_transactions.tx_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN public.offramp_transactions.gateway_id IS 'Gateway transaction identifier';
COMMENT ON COLUMN public.offramp_transactions.error_message IS 'Error message if transaction failed';
COMMENT ON COLUMN public.offramp_transactions.error_step IS 'Step where error occurred';
COMMENT ON COLUMN public.offramp_transactions.expires_at IS 'When the transaction expires';