-- Enhanced earnings tracking migration
-- This migration improves cross-chain earnings tracking and adds missing indexes

-- Add indexes for better performance on payments table
CREATE INDEX IF NOT EXISTS idx_payments_recipient_wallet_lower 
ON public.payments(LOWER(recipient_wallet));

CREATE INDEX IF NOT EXISTS idx_payments_payer_wallet_lower 
ON public.payments(LOWER(payer_wallet));

CREATE INDEX IF NOT EXISTS idx_payments_created_at 
ON public.payments(created_at);

CREATE INDEX IF NOT EXISTS idx_payments_chain 
ON public.payments(chain);

CREATE INDEX IF NOT EXISTS idx_payments_currency 
ON public.payments(currency);

-- Add indexes for payment_links table
CREATE INDEX IF NOT EXISTS idx_payment_links_paid_at 
ON public.payment_links(paid_at) WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_links_status_paid 
ON public.payment_links(status) WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_payment_links_created_by 
ON public.payment_links(created_by);

CREATE INDEX IF NOT EXISTS idx_payment_links_network 
ON public.payment_links(network);

CREATE INDEX IF NOT EXISTS idx_payment_links_token 
ON public.payment_links(token);

-- Add indexes for invoices table
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at 
ON public.invoices(paid_at) WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_status_paid 
ON public.invoices(status) WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_invoices_user_id 
ON public.invoices(user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by 
ON public.invoices(created_by);

-- Add indexes for proposals table
CREATE INDEX IF NOT EXISTS idx_proposals_paid_at 
ON public.proposals(paid_at) WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_status_paid 
ON public.proposals(status) WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_proposals_user_identifier 
ON public.proposals(user_identifier);

-- Add indexes for wallets table
CREATE INDEX IF NOT EXISTS idx_wallets_user_id 
ON public.wallets(user_id);

CREATE INDEX IF NOT EXISTS idx_wallets_address_lower 
ON public.wallets(LOWER(address));

CREATE INDEX IF NOT EXISTS idx_wallets_chain 
ON public.wallets(chain);

-- Add indexes for completed_transactions table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'completed_transactions') THEN
        CREATE INDEX IF NOT EXISTS idx_completed_transactions_user_id 
        ON public.completed_transactions(user_id);
        
        CREATE INDEX IF NOT EXISTS idx_completed_transactions_completed_at 
        ON public.completed_transactions(completed_at);
        
        CREATE INDEX IF NOT EXISTS idx_completed_transactions_network 
        ON public.completed_transactions(network);
        
        CREATE INDEX IF NOT EXISTS idx_completed_transactions_token_symbol 
        ON public.completed_transactions(token_symbol);
    END IF;
END $$;

-- Add indexes for offramp_transactions table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'offramp_transactions') THEN
        CREATE INDEX IF NOT EXISTS idx_offramp_transactions_user_id 
        ON public.offramp_transactions(user_id);
        
        CREATE INDEX IF NOT EXISTS idx_offramp_transactions_status 
        ON public.offramp_transactions(status);
        
        CREATE INDEX IF NOT EXISTS idx_offramp_transactions_created_at 
        ON public.offramp_transactions(created_at);
        
        CREATE INDEX IF NOT EXISTS idx_offramp_transactions_token 
        ON public.offramp_transactions(token);
    END IF;
END $$;

-- Add paid_at column to proposals table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'paid_at') THEN
        ALTER TABLE public.proposals ADD COLUMN paid_at timestamp with time zone;
    END IF;
END $$;

-- Add paid_at column to invoices table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'paid_at') THEN
        ALTER TABLE public.invoices ADD COLUMN paid_at timestamp with time zone;
    END IF;
END $$;

-- Add blockchain and chain_id columns to payment_links if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payment_links' AND column_name = 'blockchain') THEN
        ALTER TABLE public.payment_links ADD COLUMN blockchain varchar(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payment_links' AND column_name = 'chain_id') THEN
        ALTER TABLE public.payment_links ADD COLUMN chain_id integer;
    END IF;
END $$;

-- Add blockchain and chain_id columns to invoices if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'blockchain') THEN
        ALTER TABLE public.invoices ADD COLUMN blockchain varchar(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'chain_id') THEN
        ALTER TABLE public.invoices ADD COLUMN chain_id integer;
    END IF;
END $$;

-- Add blockchain and chain_id columns to proposals if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'blockchain') THEN
        ALTER TABLE public.proposals ADD COLUMN blockchain varchar(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'chain_id') THEN
        ALTER TABLE public.proposals ADD COLUMN chain_id integer;
    END IF;
END $$;

-- Create payment_events table if it doesn't exist (for cross-chain payment tracking)
CREATE TABLE IF NOT EXISTS public.payment_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_hash varchar(255) NOT NULL,
    payer varchar(255) NOT NULL,
    freelancer varchar(255) NOT NULL,
    amount varchar(50) NOT NULL,
    fee varchar(50) NOT NULL,
    token varchar(255) NOT NULL,
    invoice_id varchar(255) NOT NULL,
    network varchar(50) NOT NULL,
    chain_id integer,
    block_number bigint,
    timestamp timestamp with time zone NOT NULL,
    processed boolean DEFAULT FALSE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(transaction_hash, invoice_id, network)
);

-- Add indexes for payment_events table
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_hash 
ON public.payment_events(transaction_hash);

CREATE INDEX IF NOT EXISTS idx_payment_events_freelancer 
ON public.payment_events(freelancer);

CREATE INDEX IF NOT EXISTS idx_payment_events_network 
ON public.payment_events(network);

CREATE INDEX IF NOT EXISTS idx_payment_events_processed 
ON public.payment_events(processed);

CREATE INDEX IF NOT EXISTS idx_payment_events_timestamp 
ON public.payment_events(timestamp);

-- Add trigger for payment_events updated_at
DROP TRIGGER IF EXISTS update_payment_events_updated_at ON public.payment_events;
CREATE TRIGGER update_payment_events_updated_at
    BEFORE UPDATE ON public.payment_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing records to have proper blockchain and chain_id values where missing
-- Only update for supported chains: Base, Celo, Lisk, Solana

UPDATE public.payment_links 
SET blockchain = 'base', chain_id = 8453 
WHERE blockchain IS NULL AND network = 'base';

UPDATE public.payment_links 
SET blockchain = 'celo', chain_id = 42220 
WHERE blockchain IS NULL AND network = 'celo';

UPDATE public.payment_links 
SET blockchain = 'lisk', chain_id = 1135 
WHERE blockchain IS NULL AND network = 'lisk';

UPDATE public.payment_links 
SET blockchain = 'solana', chain_id = 101 
WHERE blockchain IS NULL AND network = 'solana';

-- Update invoices - default to base for existing records
UPDATE public.invoices 
SET blockchain = 'base', chain_id = 8453 
WHERE blockchain IS NULL AND payment_transaction IS NOT NULL;

-- Update proposals - default to base for existing records
UPDATE public.proposals 
SET blockchain = 'base', chain_id = 8453 
WHERE blockchain IS NULL AND payment_transaction IS NOT NULL;

-- Add comment to track migration
COMMENT ON TABLE public.payment_events IS 'Enhanced earnings tracking migration - cross-chain payment events';