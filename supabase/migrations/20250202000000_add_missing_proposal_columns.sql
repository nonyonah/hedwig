-- Add missing columns to proposals table for Telegram bot integration

-- Add freelancer information columns
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS freelancer_name TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS freelancer_email TEXT;

-- Add project description column (separate from description)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS project_description TEXT;

-- Add scope of work column
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS scope_of_work TEXT;

-- Add amount column (separate from budget for different use cases)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2);

-- Add payment terms column
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- Add payment methods JSONB column
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '{"usdc_base": "", "usdc_solana": "", "flutterwave": true}';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_email ON proposals(freelancer_email);
CREATE INDEX IF NOT EXISTS idx_proposals_amount ON proposals(amount);

-- Add comments for new columns
COMMENT ON COLUMN proposals.freelancer_name IS 'Name of the freelancer/service provider creating the proposal';
COMMENT ON COLUMN proposals.freelancer_email IS 'Email of the freelancer/service provider';
COMMENT ON COLUMN proposals.project_description IS 'Detailed project description from Telegram bot flow';
COMMENT ON COLUMN proposals.scope_of_work IS 'Scope of work and deliverables';
COMMENT ON COLUMN proposals.amount IS 'Proposal amount (used by Telegram bot, separate from budget)';
COMMENT ON COLUMN proposals.payment_terms IS 'Payment terms and conditions';
COMMENT ON COLUMN proposals.payment_methods IS 'Available payment methods in JSON format';