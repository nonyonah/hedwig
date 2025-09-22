-- Create the completed_transactions table for permanent storage of completed transactions
CREATE TABLE IF NOT EXISTS public.completed_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id varchar(255) NOT NULL,
    user_id varchar(255) NOT NULL,
    from_address varchar(255) NOT NULL,
    to_address varchar(255) NOT NULL,
    amount decimal(20, 8) NOT NULL,
    token_symbol varchar(50) NOT NULL,
    token_address varchar(255),
    network varchar(50) NOT NULL,
    status varchar(50) DEFAULT 'completed',
    transaction_hash varchar(255),
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(transaction_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_completed_transactions_transaction_id 
ON public.completed_transactions(transaction_id);

CREATE INDEX IF NOT EXISTS idx_completed_transactions_user_id 
ON public.completed_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_completed_transactions_transaction_hash 
ON public.completed_transactions(transaction_hash);

CREATE INDEX IF NOT EXISTS idx_completed_transactions_status 
ON public.completed_transactions(status);

CREATE INDEX IF NOT EXISTS idx_completed_transactions_token_symbol 
ON public.completed_transactions(token_symbol);

CREATE INDEX IF NOT EXISTS idx_completed_transactions_network 
ON public.completed_transactions(network);

CREATE INDEX IF NOT EXISTS idx_completed_transactions_completed_at 
ON public.completed_transactions(completed_at);

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE public.completed_transactions ENABLE ROW LEVEL SECURITY;

-- Example policy (uncomment if RLS is needed):
-- CREATE POLICY "Users can view their own completed transactions" ON public.completed_transactions
--     FOR SELECT USING (auth.uid()::text = user_id);

-- Grant permissions
GRANT SELECT, INSERT ON public.completed_transactions TO authenticated;
GRANT SELECT, INSERT ON public.completed_transactions TO anon;