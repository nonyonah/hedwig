-- Migration for offramp service tables
-- Run this migration to create the required tables for the new offramp service

-- Table for storing user KYC information
CREATE TABLE IF NOT EXISTS user_kyc (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kyc_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('not_started', 'pending', 'verified', 'rejected')) DEFAULT 'not_started',
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Table for storing offramp transactions
CREATE TABLE IF NOT EXISTS offramp_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(20, 8) NOT NULL,
    token TEXT NOT NULL,
    fiat_amount DECIMAL(20, 2) NOT NULL,
    fiat_currency TEXT NOT NULL,
    bank_details JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    tx_hash TEXT,
    payout_id TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_kyc_user_id ON user_kyc(user_id);
CREATE INDEX IF NOT EXISTS idx_user_kyc_status ON user_kyc(status);
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_user_id ON offramp_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_status ON offramp_transactions(status);
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_created_at ON offramp_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_payout_id ON offramp_transactions(payout_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_user_kyc_updated_at
    BEFORE UPDATE ON user_kyc
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offramp_transactions_updated_at
    BEFORE UPDATE ON offramp_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE user_kyc IS 'Stores KYC verification status for users';
COMMENT ON TABLE offramp_transactions IS 'Stores offramp transaction records';
COMMENT ON COLUMN user_kyc.kyc_id IS 'External KYC ID from Paycrest';
COMMENT ON COLUMN offramp_transactions.bank_details IS 'JSON object containing bank account details';
COMMENT ON COLUMN offramp_transactions.tx_hash IS 'Blockchain transaction hash for token transfer';
COMMENT ON COLUMN offramp_transactions.payout_id IS 'Paycrest payout ID for fiat settlement';