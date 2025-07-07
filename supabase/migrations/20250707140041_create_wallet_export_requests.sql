CREATE TABLE wallet_export_requests (
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

CREATE INDEX idx_export_token ON wallet_export_requests(export_token);
CREATE INDEX idx_user_phone ON wallet_export_requests(user_phone);
CREATE INDEX idx_status ON wallet_export_requests(status);
