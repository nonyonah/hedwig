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
          referral_link: `https://t.me/hedwig_bot?start=ref_${userId}`
        };
      }
      console.error('Error fetching user referral stats:', error);
      return null;
    }

    return {
      points: data.points,
      referral_count: data.referral_count,
      referral_link: `https://t.me/hedwig_bot?start=ref_${userId}`
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
    first_invoice: 5,
    first_proposal: 5,
    first_payment_link: 2,
    first_offramp: 2
  };

  const points = pointsMap[action];
  return await awardPoints(userId, points);
}