-- Add monthly leaderboard and badge system schema

-- Create monthly_leaderboard_periods table to track contest periods
CREATE TABLE IF NOT EXISTS monthly_leaderboard_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(year, month)
);

-- Create badges table to define available badges
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  emoji VARCHAR(10) DEFAULT '🏅',
  badge_type VARCHAR(50) NOT NULL, -- 'monthly_top_referrer', 'milestone', 'special'
  criteria JSONB, -- Store criteria for earning the badge
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_badges table to track awarded badges
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  period_id UUID REFERENCES monthly_leaderboard_periods(id) ON DELETE SET NULL,
  awarded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  awarded_for JSONB, -- Store context about why badge was awarded
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, badge_id, period_id)
);

-- Create monthly_referral_stats table for monthly tracking
CREATE TABLE IF NOT EXISTS monthly_referral_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES monthly_leaderboard_periods(id) ON DELETE CASCADE,
  points INTEGER DEFAULT 0,
  referral_count INTEGER DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, period_id)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_monthly_leaderboard_periods_active ON monthly_leaderboard_periods(is_active, year, month);
CREATE INDEX IF NOT EXISTS idx_badges_type ON badges(badge_type, is_active);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_period ON user_badges(period_id);
CREATE INDEX IF NOT EXISTS idx_monthly_referral_stats_period ON monthly_referral_stats(period_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_referral_stats_user ON monthly_referral_stats(user_id);

-- Insert default badges
INSERT INTO badges (name, description, emoji, badge_type, criteria) VALUES
('Top Referrer of the Month', 'Awarded to the #1 referrer each month', '🥇', 'monthly_top_referrer', '{"position": 1}'),
('Silver Referrer', 'Awarded to the #2 referrer each month', '🥈', 'monthly_top_referrer', '{"position": 2}'),
('Bronze Referrer', 'Awarded to the #3 referrer each month', '🥉', 'monthly_top_referrer', '{"position": 3}'),
('Rising Star', 'Awarded to top 10 referrers each month', '⭐', 'monthly_top_referrer', '{"position": 10}'),
('First Referral', 'Awarded for making your first successful referral', '🎯', 'milestone', '{"referrals": 1}'),
('Referral Master', 'Awarded for reaching 10 referrals', '👑', 'milestone', '{"referrals": 10}'),
('Point Collector', 'Awarded for reaching 100 points', '💎', 'milestone', '{"points": 100}'),
('Referral Legend', 'Awarded for reaching 50 referrals', '🏆', 'milestone', '{"referrals": 50}')
ON CONFLICT (name) DO NOTHING;

-- Create function to get current active period
CREATE OR REPLACE FUNCTION get_current_period()
RETURNS UUID AS $$
DECLARE
  current_period_id UUID;
  current_year INTEGER;
  current_month INTEGER;
  period_start TIMESTAMP WITH TIME ZONE;
  period_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get current year and month
  current_year := EXTRACT(YEAR FROM NOW());
  current_month := EXTRACT(MONTH FROM NOW());
  
  -- Try to find existing active period
  SELECT id INTO current_period_id
  FROM monthly_leaderboard_periods
  WHERE year = current_year AND month = current_month AND is_active = true;
  
  -- If no active period exists, create one
  IF current_period_id IS NULL THEN
    -- Calculate period boundaries
    period_start := DATE_TRUNC('month', NOW());
    period_end := (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second');
    
    -- Insert new period
    INSERT INTO monthly_leaderboard_periods (year, month, start_date, end_date, is_active)
    VALUES (current_year, current_month, period_start, period_end, true)
    RETURNING id INTO current_period_id;
  END IF;
  
  RETURN current_period_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to reset monthly leaderboard
CREATE OR REPLACE FUNCTION reset_monthly_leaderboard()
RETURNS VOID AS $$
DECLARE
  prev_period_id UUID;
  new_period_id UUID;
  current_year INTEGER;
  current_month INTEGER;
  period_start TIMESTAMP WITH TIME ZONE;
  period_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get current year and month
  current_year := EXTRACT(YEAR FROM NOW());
  current_month := EXTRACT(MONTH FROM NOW());
  
  -- Deactivate previous periods
  UPDATE monthly_leaderboard_periods 
  SET is_active = false, updated_at = NOW()
  WHERE is_active = true;
  
  -- Create new active period
  period_start := DATE_TRUNC('month', NOW());
  period_end := (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second');
  
  INSERT INTO monthly_leaderboard_periods (year, month, start_date, end_date, is_active)
  VALUES (current_year, current_month, period_start, period_end, true)
  RETURNING id INTO new_period_id;
  
  -- Award badges for previous month's winners
  PERFORM award_monthly_badges();
  
END;
$$ LANGUAGE plpgsql;

-- Create function to award monthly badges
CREATE OR REPLACE FUNCTION award_monthly_badges()
RETURNS VOID AS $$
DECLARE
  prev_period_id UUID;
  badge_record RECORD;
  user_record RECORD;
  position_counter INTEGER;
BEGIN
  -- Get the most recent inactive period (previous month)
  SELECT id INTO prev_period_id
  FROM monthly_leaderboard_periods
  WHERE is_active = false
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF prev_period_id IS NULL THEN
    RETURN; -- No previous period to award badges for
  END IF;
  
  -- Award position-based badges (Top 3 + Rising Star for top 10)
  position_counter := 1;
  
  FOR user_record IN (
    SELECT rp.user_id, rp.points, rp.referral_count
    FROM referral_points rp
    JOIN users u ON rp.user_id = u.id
    ORDER BY rp.points DESC, rp.referral_count DESC
    LIMIT 10
  ) LOOP
    -- Award specific position badges
    IF position_counter = 1 THEN
      INSERT INTO user_badges (user_id, badge_id, period_id, awarded_for)
      SELECT user_record.user_id, b.id, prev_period_id, 
             json_build_object('position', 1, 'points', user_record.points, 'referrals', user_record.referral_count)
      FROM badges b
      WHERE b.name = 'Top Referrer of the Month'
      ON CONFLICT (user_id, badge_id, period_id) DO NOTHING;
    ELSIF position_counter = 2 THEN
      INSERT INTO user_badges (user_id, badge_id, period_id, awarded_for)
      SELECT user_record.user_id, b.id, prev_period_id,
             json_build_object('position', 2, 'points', user_record.points, 'referrals', user_record.referral_count)
      FROM badges b
      WHERE b.name = 'Silver Referrer'
      ON CONFLICT (user_id, badge_id, period_id) DO NOTHING;
    ELSIF position_counter = 3 THEN
      INSERT INTO user_badges (user_id, badge_id, period_id, awarded_for)
      SELECT user_record.user_id, b.id, prev_period_id,
             json_build_object('position', 3, 'points', user_record.points, 'referrals', user_record.referral_count)
      FROM badges b
      WHERE b.name = 'Bronze Referrer'
      ON CONFLICT (user_id, badge_id, period_id) DO NOTHING;
    END IF;
    
    -- Award Rising Star to all top 10
    IF position_counter <= 10 THEN
      INSERT INTO user_badges (user_id, badge_id, period_id, awarded_for)
      SELECT user_record.user_id, b.id, prev_period_id,
             json_build_object('position', position_counter, 'points', user_record.points, 'referrals', user_record.referral_count)
      FROM badges b
      WHERE b.name = 'Rising Star'
      ON CONFLICT (user_id, badge_id, period_id) DO NOTHING;
    END IF;
    
    position_counter := position_counter + 1;
  END LOOP;
  
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on new tables
ALTER TABLE monthly_leaderboard_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_referral_stats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Monthly leaderboard periods - readable by all authenticated users
CREATE POLICY "Monthly periods are viewable by authenticated users" ON monthly_leaderboard_periods
  FOR SELECT USING (auth.role() = 'authenticated');

-- Badges - readable by all authenticated users
CREATE POLICY "Badges are viewable by authenticated users" ON badges
  FOR SELECT USING (auth.role() = 'authenticated');

-- User badges - users can view all badges, but only service role can insert
CREATE POLICY "User badges are viewable by authenticated users" ON user_badges
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "User badges can be inserted by service role" ON user_badges
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Monthly referral stats - users can view all, service role can manage
CREATE POLICY "Monthly stats are viewable by authenticated users" ON monthly_referral_stats
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Monthly stats can be managed by service role" ON monthly_referral_stats
  FOR ALL USING (auth.role() = 'service_role');

COMMIT;