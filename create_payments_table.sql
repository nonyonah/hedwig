-- Create the payments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    amount_paid decimal(20, 8) NOT NULL,
    payer_wallet varchar(255),
    tx_hash varchar(255) UNIQUE,
    status varchar(50) DEFAULT 'pending',
    payment_type varchar(50) DEFAULT 'direct_transfer',
    recipient_wallet varchar(255),
    recipient_user_id text,
    invoice_id uuid,
    payment_link_id uuid,
    proposal_id uuid,
    currency varchar(10) DEFAULT 'ETH',
    chain varchar(50) DEFAULT 'BASE_MAINNET',
    notification_sent boolean DEFAULT FALSE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash 
ON public.payments(tx_hash);

CREATE INDEX IF NOT EXISTS idx_payments_recipient_user_id 
ON public.payments(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_payments_notification_sent 
ON public.payments(tx_hash, notification_sent);

CREATE INDEX IF NOT EXISTS idx_payments_status 
ON public.payments(status);

CREATE INDEX IF NOT EXISTS idx_payments_payment_type 
ON public.payments(payment_type);

-- Add foreign key constraints if the referenced tables exist
-- Note: These will be added only if the tables exist
DO $$
BEGIN
    -- Check if invoices table exists and add foreign key
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'invoices') THEN
        ALTER TABLE public.payments 
        ADD CONSTRAINT fk_payments_invoice_id 
        FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
    END IF;
    
    -- Check if payment_links table exists and add foreign key
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_links') THEN
        ALTER TABLE public.payments 
        ADD CONSTRAINT fk_payments_payment_link_id 
        FOREIGN KEY (payment_link_id) REFERENCES public.payment_links(id) ON DELETE SET NULL;
    END IF;
    
    -- Check if proposals table exists and add foreign key
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'proposals') THEN
        ALTER TABLE public.payments 
        ADD CONSTRAINT fk_payments_proposal_id 
        FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Ignore if constraints already exist
        NULL;
END $$;

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();