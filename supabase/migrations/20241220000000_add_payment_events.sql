-- Migration: Add comprehensive payment_events table for blockchain payment tracking
-- This table stores all payment events from the HedwigPayment smart contract
-- and integrates with invoices, proposals, and payment_links

-- Drop existing payment_events table if it exists
DROP TABLE IF EXISTS payment_events CASCADE;
DROP VIEW IF EXISTS payment_summaries CASCADE;

-- Create comprehensive payment_events table
CREATE TABLE payment_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_hash TEXT NOT NULL UNIQUE,
    payer TEXT NOT NULL,
    freelancer TEXT NOT NULL,
    amount TEXT NOT NULL, -- Stored as string to handle large numbers (in token units)
    fee TEXT NOT NULL, -- Fee amount in token units
    token TEXT NOT NULL DEFAULT '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', -- Base mainnet USDC
    invoice_id TEXT, -- Can reference invoice_<id>, proposal_<id>, or payment_link_<id>
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    payment_type TEXT DEFAULT 'invoice' CHECK (payment_type IN ('invoice', 'proposal', 'payment_link')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    network TEXT DEFAULT 'base' CHECK (network IN ('base', 'optimism', 'bnb', 'celo')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_payment_events_invoice_id ON payment_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_freelancer ON payment_events(freelancer);
CREATE INDEX IF NOT EXISTS idx_payment_events_payer ON payment_events(payer);
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_hash ON payment_events(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_payment_events_timestamp ON payment_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events(processed);
CREATE INDEX IF NOT EXISTS idx_payment_events_token ON payment_events(token);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_type ON payment_events(payment_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events(status);
CREATE INDEX IF NOT EXISTS idx_payment_events_network ON payment_events(network);

-- Add RLS policies
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view payment events related to their invoices/proposals/payment_links
CREATE POLICY "Users can view their payment events" ON payment_events
    FOR SELECT USING (
        invoice_id IN (
            SELECT CONCAT('invoice_', id::text) FROM invoices WHERE user_id = (auth.jwt() ->> 'sub')::text
            UNION
            SELECT CONCAT('proposal_', id::text) FROM proposals WHERE user_identifier = (auth.jwt() ->> 'sub')::uuid
            UNION
            SELECT CONCAT('payment_link_', id::text) FROM payment_links WHERE created_by = (auth.jwt() ->> 'sub')::uuid
        )
    );

-- Policy: Service role can manage all payment events
CREATE POLICY "Service role can manage payment events" ON payment_events
    FOR ALL USING (auth.role() = 'service_role');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payment_events_updated_at 
    BEFORE UPDATE ON payment_events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add payment_transaction column to invoices table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'payment_transaction') THEN
        ALTER TABLE invoices ADD COLUMN payment_transaction TEXT;
        CREATE INDEX IF NOT EXISTS idx_invoices_payment_transaction ON invoices(payment_transaction);
    END IF;
END $$;

-- Add payment_transaction column to proposals table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'payment_transaction') THEN
        ALTER TABLE proposals ADD COLUMN payment_transaction TEXT;
        CREATE INDEX IF NOT EXISTS idx_proposals_payment_transaction ON proposals(payment_transaction);
    END IF;
END $$;

-- Add payment_transaction column to payment_links table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payment_links' AND column_name = 'payment_transaction') THEN
        ALTER TABLE payment_links ADD COLUMN payment_transaction TEXT;
        CREATE INDEX IF NOT EXISTS idx_payment_links_payment_transaction ON payment_links(payment_transaction);
    END IF;
END $$;

-- Add paid_at column to invoices table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'paid_at') THEN
        ALTER TABLE invoices ADD COLUMN paid_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON invoices(paid_at);
    END IF;
END $$;

-- Add paid_at column to proposals table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'paid_at') THEN
        ALTER TABLE proposals ADD COLUMN paid_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_proposals_paid_at ON proposals(paid_at);
    END IF;
END $$;

-- Add paid_at column to payment_links table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'payment_links' AND column_name = 'paid_at') THEN
        ALTER TABLE payment_links ADD COLUMN paid_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_payment_links_paid_at ON payment_links(paid_at);
    END IF;
END $$;

-- Create a comprehensive view for payment summaries
CREATE OR REPLACE VIEW payment_summaries AS
SELECT 
    pe.invoice_id,
    pe.freelancer,
    pe.token,
    pe.payment_type,
    pe.network,
    SUM(pe.amount::NUMERIC) as total_amount,
    SUM(pe.fee::NUMERIC) as total_fees,
    COUNT(*) as payment_count,
    MIN(pe.timestamp) as first_payment,
    MAX(pe.timestamp) as last_payment,
    ARRAY_AGG(pe.transaction_hash ORDER BY pe.timestamp) as transaction_hashes,
    ARRAY_AGG(pe.status ORDER BY pe.timestamp) as payment_statuses
FROM payment_events pe
WHERE pe.processed = true
GROUP BY pe.invoice_id, pe.freelancer, pe.token, pe.payment_type, pe.network;

-- Grant permissions
GRANT SELECT ON payment_summaries TO authenticated;
GRANT ALL ON payment_events TO service_role;

-- Add comments
COMMENT ON TABLE payment_events IS 'Comprehensive table storing blockchain payment events from HedwigPayment smart contract, supporting invoices, proposals, and payment links';
COMMENT ON COLUMN payment_events.amount IS 'Payment amount in token units (not wei)';
COMMENT ON COLUMN payment_events.fee IS 'Fee amount in token units';
COMMENT ON COLUMN payment_events.token IS 'Token contract address (defaults to Base USDC)';
COMMENT ON COLUMN payment_events.invoice_id IS 'Reference ID in format: invoice_<id>, proposal_<id>, or payment_link_<id>';
COMMENT ON COLUMN payment_events.payment_type IS 'Type of payment: invoice, proposal, or payment_link';
COMMENT ON COLUMN payment_events.status IS 'Payment status: pending, confirmed, or failed';
COMMENT ON COLUMN payment_events.network IS 'Blockchain network where payment occurred';