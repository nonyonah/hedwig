-- Migration: Add wallet_export_requests table
-- Description: Creates a table to store wallet export requests with security features

-- Create wallet_export_requests table
CREATE TABLE IF NOT EXISTS wallet_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone VARCHAR(20) NOT NULL,
  wallet_id VARCHAR(100) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  export_token VARCHAR(100) UNIQUE NOT NULL,
  encrypted_private_key TEXT,
  encapsulation TEXT,
  recipient_public_key TEXT,
  recipient_private_key TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 hour'),
  completed_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_export_token ON wallet_export_requests(export_token);
CREATE INDEX IF NOT EXISTS idx_user_phone ON wallet_export_requests(user_phone);
CREATE INDEX IF NOT EXISTS idx_status ON wallet_export_requests(status);

-- Add comment to table for documentation
COMMENT ON TABLE wallet_export_requests IS 'Stores wallet export requests with encrypted private keys and security tokens';

-- Add comments to columns
COMMENT ON COLUMN wallet_export_requests.id IS 'Unique identifier for the export request';
COMMENT ON COLUMN wallet_export_requests.user_phone IS 'Phone number of the user requesting the export';
COMMENT ON COLUMN wallet_export_requests.wallet_id IS 'Privy wallet ID being exported';
COMMENT ON COLUMN wallet_export_requests.wallet_address IS 'Ethereum address of the wallet';
COMMENT ON COLUMN wallet_export_requests.export_token IS 'Secure token for accessing the export';
COMMENT ON COLUMN wallet_export_requests.encrypted_private_key IS 'HPKE-encrypted private key from Privy';
COMMENT ON COLUMN wallet_export_requests.encapsulation IS 'HPKE encapsulation data';
COMMENT ON COLUMN wallet_export_requests.recipient_public_key IS 'HPKE public key used for encryption';
COMMENT ON COLUMN wallet_export_requests.recipient_private_key IS 'HPKE private key used for decryption';
COMMENT ON COLUMN wallet_export_requests.status IS 'Current status: pending, ready, completed, or failed';
COMMENT ON COLUMN wallet_export_requests.created_at IS 'When the export request was created';
COMMENT ON COLUMN wallet_export_requests.expires_at IS 'When the export request expires (1 hour after creation)';
COMMENT ON COLUMN wallet_export_requests.completed_at IS 'When the export was completed';