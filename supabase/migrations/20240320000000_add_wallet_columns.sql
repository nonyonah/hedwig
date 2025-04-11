-- Add wallet-related columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wallet_address text,
ADD COLUMN IF NOT EXISTS ens_name text,
ADD COLUMN IF NOT EXISTS basename text,
ADD COLUMN IF NOT EXISTS display_name text;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_ens_name ON profiles(ens_name);
CREATE INDEX IF NOT EXISTS idx_profiles_basename ON profiles(basename); 