import { supabase } from './supabase';

export interface LeaderboardEntry {
  user_id: string;
  username?: string;
  points: number;
  referral_count: number;
}

export interface ReferralStats {
  points: number;
  referral_count: number;
  referral_link: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  badge_type: string;
  criteria: any;
  is_active: boolean;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge: Badge;
  period_id?: string;
  awarded_at: string;
  awarded_for: any;
}

export interface MonthlyPeriod {
  id: string;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface MonthlyLeaderboardEntry extends LeaderboardEntry {
  badges: UserBadge[];
  rank: number;
}

/**
 * Award points to a user and update their referral stats
 */
export async function awardPoints(userId: string, points: number): Promise<boolean> {
  try {
    // First, try to update existing record
    const { data: existingRecord, error: fetchError } = await supabase
      .from('referral_points')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching referral points:', fetchError);
      return false;
    }

    if (existingRecord) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('referral_points')
        .update({
          points: existingRecord.points + points,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating referral points:', updateError);
        return false;
      }
    } else {
      // Create new record
      const { error: insertError } = await supabase
        .from('referral_points')
        .insert({
          user_id: userId,
          points: points,
          referral_count: 0
        });

      if (insertError) {
        console.error('Error inserting referral points:', insertError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error in awardPoints:', error);
    return false;
  }
}

/**
 * Increment referral count and award points to referrer
 */
export async function processReferral(referrerId: string, newUserId: string): Promise<boolean> {
  try {
    // Update the new user's referred_by field
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ referred_by: referrerId })
      .eq('id', newUserId);

    if (userUpdateError) {
      console.error('Error updating user referred_by:', userUpdateError);
      return false;
    }

    // Award points to referrer and increment referral count
    const { data: referrerRecord, error: fetchError } = await supabase
      .from('referral_points')
      .select('*')
      .eq('user_id', referrerId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching referrer points:', fetchError);
      return false;
    }

    if (referrerRecord) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('referral_points')
        .update({
          points: referrerRecord.points + 10,
          referral_count: referrerRecord.referral_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', referrerId);

      if (updateError) {
        console.error('Error updating referrer points:', updateError);
        return false;
      }
    } else {
      // Create new record for referrer
      const { error: insertError } = await supabase
        .from('referral_points')
        .insert({
          user_id: referrerId,
          points: 10,
          referral_count: 1
        });

      if (insertError) {
        console.error('Error inserting referrer points:', insertError);
        return false;
      }
    }

    // Initialize referral_points record for new user
    const { error: newUserInsertError } = await supabase
      .from('referral_points')
      .insert({
        user_id: newUserId,
        points: 0,
        referral_count: 0
      });

    if (newUserInsertError) {
      console.error('Error initializing new user referral points:', newUserInsertError);
      // Don't return false here as the main referral process succeeded
    }

    return true;
  } catch (error) {
    console.error('Error in processReferral:', error);
    return false;
  }
}

/**
 * Get user's referral stats
 */
export async function getUserReferralStats(userId: string): Promise<ReferralStats | null> {
  try {
    const { data, error } = await supabase
      .from('referral_points')
      .select('points, referral_count')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No record found, return default stats
        return {
          points: 0,
          referral_count: 0,
          referral_link: `https://t.me/HedwigAssistBot?start=ref_${userId}`
        };
      }
      console.error('Error fetching user referral stats:', error);
      return null;
    }

    return {
      points: data.points,
      referral_count: data.referral_count,
      referral_link: `https://t.me/HedwigAssistBot?start=ref_${userId}`
    };
  } catch (error) {
    console.error('Error in getUserReferralStats:', error);
    return null;
  }
}

/**
 * Get leaderboard of top users by points
 */
export async function getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase
      .from('referral_points')
      .select(`
        user_id,
        points,
        referral_count,
        users!inner(username)
      `)
      .order('points', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }

    return data.map(entry => ({
      user_id: entry.user_id,
      username: (entry.users as any)?.username,
      points: entry.points,
      referral_count: entry.referral_count
    }));
  } catch (error) {
    console.error('Error in getLeaderboard:', error);
    return [];
  }
}

/**
 * Extract user ID from referral parameter
 */
export function extractReferrerIdFromPayload(payload: string): string | null {
  if (!payload || !payload.startsWith('ref_')) {
    return null;
  }
  return payload.substring(4); // Remove 'ref_' prefix
}

/**
 * Award points for specific actions
 */
export async function awardActionPoints(userId: string, action: 'first_invoice' | 'first_proposal' | 'first_payment_link' | 'first_offramp'): Promise<boolean> {
  const pointsMap = {
    first_invoice: 10,
    first_proposal: 5,
    first_payment_link: 5,
    first_offramp: 15
  };

  const points = pointsMap[action];
  return await awardPoints(userId, points);
}

/**
 * Get current active monthly period
 */
export async function getCurrentPeriod(): Promise<MonthlyPeriod | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_current_period');

    if (error) {
      console.error('Error getting current period:', error);
      return null;
    }

    if (!data) return null;

    // Get the period details
    const { data: period, error: periodError } = await supabase
      .from('monthly_leaderboard_periods')
      .select('*')
      .eq('id', data)
      .single();

    if (periodError) {
      console.error('Error fetching period details:', periodError);
      return null;
    }

    return period;
  } catch (error) {
    console.error('Error in getCurrentPeriod:', error);
    return null;
  }
}

/**
 * Reset monthly leaderboard and award badges
 */
export async function resetMonthlyLeaderboard(): Promise<boolean> {
  try {
    const { error } = await supabase
      .rpc('reset_monthly_leaderboard');

    if (error) {
      console.error('Error resetting monthly leaderboard:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in resetMonthlyLeaderboard:', error);
    return false;
  }
}

/**
 * Get user badges
 */
export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select(`
        id,
        user_id,
        period_id,
        awarded_at,
        awarded_for,
        badge:badges(
          id,
          name,
          description,
          emoji,
          badge_type,
          criteria,
          is_active
        )
      `)
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false });

    if (error) {
      console.error('Error fetching user badges:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserBadges:', error);
    return [];
  }
}

/**
 * Get monthly leaderboard with badges
 */
export async function getMonthlyLeaderboard(limit: number = 10, periodId?: string): Promise<MonthlyLeaderboardEntry[]> {
  try {
    let currentPeriodId = periodId;
    
    // If no period specified, get current period
    if (!currentPeriodId) {
      const currentPeriod = await getCurrentPeriod();
      if (!currentPeriod) {
        console.error('No current period found');
        return [];
      }
      currentPeriodId = currentPeriod.id;
    }

    // Get leaderboard data
    const { data: leaderboardData, error: leaderboardError } = await supabase
      .from('referral_points')
      .select(`
        user_id,
        points,
        referral_count,
        users!inner(
          username
        )
      `)
      .order('points', { ascending: false })
      .order('referral_count', { ascending: false })
      .limit(limit);

    if (leaderboardError) {
      console.error('Error fetching leaderboard:', leaderboardError);
      return [];
    }

    if (!leaderboardData) return [];

    // Get badges for all users in the leaderboard
    const userIds = leaderboardData.map(entry => entry.user_id);
    const { data: badgesData, error: badgesError } = await supabase
      .from('user_badges')
      .select(`
        id,
        user_id,
        period_id,
        awarded_at,
        awarded_for,
        badge:badges(
          id,
          name,
          description,
          emoji,
          badge_type,
          criteria,
          is_active
        )
      `)
      .in('user_id', userIds)
      .eq('period_id', currentPeriodId);

    if (badgesError) {
      console.error('Error fetching badges:', badgesError);
    }

    // Combine leaderboard data with badges
    const result: MonthlyLeaderboardEntry[] = leaderboardData.map((entry, index) => {
      const userBadges = badgesData?.filter(badge => badge.user_id === entry.user_id) || [];
      
      return {
        user_id: entry.user_id,
        username: entry.users?.username,
        points: entry.points,
        referral_count: entry.referral_count,
        badges: userBadges,
        rank: index + 1
      };
    });

    return result;
  } catch (error) {
    console.error('Error in getMonthlyLeaderboard:', error);
    return [];
  }
}

/**
 * Award milestone badges to users
 */
export async function awardMilestoneBadges(userId: string): Promise<boolean> {
  try {
    // Get user's current stats
    const { data: userStats, error: statsError } = await supabase
      .from('referral_points')
      .select('points, referral_count')
      .eq('user_id', userId)
      .maybeSingle();

    if (statsError) {
      console.error('Error fetching user stats for milestone badges:', statsError);
      return false;
    }

    // If user has no referral points record, they have 0 points and referrals
    const points = userStats?.points || 0;
    const referralCount = userStats?.referral_count || 0;

    // Get available milestone badges
    const { data: milestoneBadges, error: badgesError } = await supabase
      .from('badges')
      .select('*')
      .eq('badge_type', 'milestone')
      .eq('is_active', true);

    if (badgesError || !milestoneBadges) {
      console.error('Error fetching milestone badges:', badgesError);
      return false;
    }

    // Check which badges the user qualifies for
    for (const badge of milestoneBadges) {
      const criteria = badge.criteria;
      let qualifies = false;

      if (criteria.referrals && referralCount >= criteria.referrals) {
        qualifies = true;
      } else if (criteria.points && points >= criteria.points) {
        qualifies = true;
      }

      if (qualifies) {
        // Check if user already has this badge
        const { data: existingBadge, error: checkError } = await supabase
          .from('user_badges')
          .select('id')
          .eq('user_id', userId)
          .eq('badge_id', badge.id)
          .is('period_id', null) // Milestone badges don't have periods
          .maybeSingle();

        if (checkError) {
          console.error('Error checking existing badge:', checkError);
          continue;
        }

        if (!existingBadge) {
          // Award the badge
          const { error: awardError } = await supabase
            .from('user_badges')
            .insert({
              user_id: userId,
              badge_id: badge.id,
              period_id: null,
              awarded_for: {
                points: points,
                referrals: referralCount,
                milestone: true
              }
            });

          if (awardError) {
            console.error('Error awarding milestone badge:', awardError);
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error in awardMilestoneBadges:', error);
    return false;
  }
}

/**
 * Get all available badges
 */
export async function getAllBadges(): Promise<Badge[]> {
  try {
    const { data, error } = await supabase
      .from('badges')
      .select('*')
      .eq('is_active', true)
      .order('badge_type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching badges:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllBadges:', error);
    return [];
  }
}