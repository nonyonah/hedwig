-- Create contract_deployments table for tracking smart contract deployments
CREATE TABLE IF NOT EXISTS contract_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Contract Details
    contract_address TEXT NOT NULL,
    chain TEXT NOT NULL, -- 'base', 'celo', 'polygon', etc.
    contract_type TEXT NOT NULL, -- 'factory', 'project', 'payment'
    
    -- Deployment Details
    deployment_tx_hash TEXT,
    block_number BIGINT,
    gas_used TEXT,
    deployment_cost TEXT,
    
    -- Configuration
    platform_wallet TEXT,
    platform_fee_rate INTEGER,
    
    -- Status and Metadata
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Deployment initiated
        'deployed',     -- Successfully deployed
        'verified',     -- Contract verified on block explorer
        'failed'        -- Deployment failed
    )),
    
    error_message TEXT, -- Error details if deployment failed
    verification_status TEXT, -- 'pending', 'verified', 'failed'
    
    -- Timeline
    deployed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contract_deployments_chain ON contract_deployments(chain);
CREATE INDEX IF NOT EXISTS idx_contract_deployments_contract_type ON contract_deployments(contract_type);
CREATE INDEX IF NOT EXISTS idx_contract_deployments_status ON contract_deployments(status);
CREATE INDEX IF NOT EXISTS idx_contract_deployments_contract_address ON contract_deployments(contract_address);
CREATE INDEX IF NOT EXISTS idx_contract_deployments_created_at ON contract_deployments(created_at);

-- Create unique constraint for active factory contracts per chain
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_factory_per_chain 
ON contract_deployments(chain, contract_type) 
WHERE contract_type = 'factory' AND status = 'deployed';

-- Create trigger for updated_at timestamp
CREATE TRIGGER update_contract_deployments_updated_at 
    BEFORE UPDATE ON contract_deployments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add RLS (Row Level Security) policies
ALTER TABLE contract_deployments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_deployments
CREATE POLICY "Admin users can view all deployments" ON contract_deployments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND (email LIKE '%@hedwig.build' OR email LIKE '%@admin.hedwig%')
        )
    );

CREATE POLICY "Admin users can manage deployments" ON contract_deployments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND (email LIKE '%@hedwig.build' OR email LIKE '%@admin.hedwig%')
        )
    );

-- Create view for deployment summary
CREATE OR REPLACE VIEW deployment_summary AS
SELECT 
    chain,
    contract_type,
    COUNT(*) as total_deployments,
    COUNT(CASE WHEN status = 'deployed' THEN 1 END) as successful_deployments,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_deployments,
    COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified_deployments,
    MAX(deployed_at) as latest_deployment,
    MIN(deployed_at) as first_deployment
FROM contract_deployments
GROUP BY chain, contract_type;

-- Create function to get active factory address for a chain
CREATE OR REPLACE FUNCTION get_active_factory_address(target_chain TEXT)
RETURNS TEXT AS $$
DECLARE
    factory_address TEXT;
BEGIN
    SELECT contract_address INTO factory_address
    FROM contract_deployments
    WHERE chain = target_chain 
    AND contract_type = 'factory' 
    AND status = 'deployed'
    ORDER BY deployed_at DESC
    LIMIT 1;
    
    RETURN factory_address;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to log deployment events
CREATE OR REPLACE FUNCTION log_deployment_event(
    p_contract_address TEXT,
    p_chain TEXT,
    p_contract_type TEXT,
    p_status TEXT,
    p_tx_hash TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    deployment_id UUID;
BEGIN
    INSERT INTO contract_deployments (
        contract_address,
        chain,
        contract_type,
        status,
        deployment_tx_hash,
        error_message,
        deployed_at
    ) VALUES (
        p_contract_address,
        p_chain,
        p_contract_type,
        p_status,
        p_tx_hash,
        p_error_message,
        CASE WHEN p_status = 'deployed' THEN NOW() ELSE NULL END
    ) RETURNING id INTO deployment_id;
    
    RETURN deployment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;