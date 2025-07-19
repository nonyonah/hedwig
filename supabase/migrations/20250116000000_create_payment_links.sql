-- Create payment_links table for crypto payment requests
CREATE TABLE IF NOT EXISTS public.payment_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    amount DECIMAL(20, 8) NOT NULL,
    token VARCHAR(10) NOT NULL,
    network VARCHAR(50) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    payment_reason TEXT NOT NULL,
    recipient_email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
    transaction_hash VARCHAR(66),
    paid_amount DECIMAL(20, 8),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_wallet_address ON public.payment_links(wallet_address);
CREATE INDEX IF NOT EXISTS idx_payment_links_created_at ON public.payment_links(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_links_transaction_hash ON public.payment_links(transaction_hash);

-- Enable Row Level Security
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Allow service role full access to payment_links"
ON public.payment_links
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create policy to allow public read access to payment links (for payment page)
CREATE POLICY "Allow public read access to payment_links"
ON public.payment_links
FOR SELECT
USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER payment_links_updated_at_trigger
    BEFORE UPDATE ON public.payment_links
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_links_updated_at();

-- Add comment to the table
COMMENT ON TABLE public.payment_links IS 'Stores crypto payment link requests with payment tracking';