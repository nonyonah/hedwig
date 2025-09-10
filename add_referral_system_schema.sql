-- Add referral system schema
-- 1. Add referred_by column to users table
ALTER TABLE users ADD COLUMN referred_by UUID REFERENCES users(id);

-- 2. Create referral_points table
CREATE TABLE referral_points (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE NOT NULL,
    points INT DEFAULT 0,
    referral_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create index for better performance
CREATE INDEX idx_referral_points_user_id ON referral_points(user_id);
CREATE INDEX idx_referral_points_points ON referral_points(points DESC);
CREATE INDEX idx_users_referred_by ON users(referred_by);

-- 4. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_referral_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for updated_at
CREATE TRIGGER trigger_update_referral_points_updated_at
    BEFORE UPDATE ON referral_points
    FOR EACH ROW
    EXECUTE FUNCTION update_referral_points_updated_at();