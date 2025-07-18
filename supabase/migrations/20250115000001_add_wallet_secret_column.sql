-- Add wallet_secret column to wallets table
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS wallet_secret TEXT;

-- Add cdp_wallet_id column to wallets table if it doesn't exist
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS cdp_wallet_id TEXT;

-- Add chain column to wallets table if it doesn't exist
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS chain TEXT DEFAULT 'evm' CHECK (chain IN ('evm', 'solana'));

-- Add unique constraint on cdp_wallet_id
ALTER TABLE public.wallets
ADD CONSTRAINT IF NOT EXISTS wallets_cdp_wallet_id_unique UNIQUE (cdp_wallet_id);

-- Add comments for clarity
COMMENT ON COLUMN public.wallets.wallet_secret IS 'Encrypted wallet secret for CDP wallet management';
COMMENT ON COLUMN public.wallets.cdp_wallet_id IS 'Coinbase Developer Platform wallet ID';
COMMENT ON COLUMN public.wallets.chain IS 'Blockchain type: evm or solana';