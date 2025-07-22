import { supabase } from './supabase';

export interface UserPreferences {
  userId: string;
  walletAddress: string;
  monthlyReportsEnabled: boolean;
  preferredCurrency: string;
  preferredCategories: string[];
  timezone?: string;
  lastReportSent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProactiveSummarySettings {
  enabled: boolean;
  dayOfMonth: number; // 1-31, day of month to send summary
  includeInsights: boolean;
  includeFiatValues: boolean;
  includeCategories: boolean;
}

/**
 * Get user preferences for a wallet address
 */
export async function getUserPreferences(walletAddress: string): Promise<UserPreferences | null> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching user preferences:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getUserPreferences:', error);
    return null;
  }
}

/**
 * Update or create user preferences
 */
export async function updateUserPreferences(
  walletAddress: string, 
  preferences: Partial<UserPreferences>
): Promise<UserPreferences | null> {
  try {
    const existingPrefs = await getUserPreferences(walletAddress);
    
    const upsertData = {
      wallet_address: walletAddress.toLowerCase(),
      monthly_reports_enabled: preferences.monthlyReportsEnabled ?? true,
      preferred_currency: preferences.preferredCurrency ?? 'USD',
      preferred_categories: preferences.preferredCategories ?? [],
      timezone: preferences.timezone ?? 'UTC',
      last_report_sent: preferences.lastReportSent,
      updated_at: new Date().toISOString(),
      ...(existingPrefs ? {} : { created_at: new Date().toISOString() })
    };

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(upsertData, { onConflict: 'wallet_address' })
      .select()
      .single();

    if (error) {
      console.error('Error updating user preferences:', error);
      return null;
    }

    return {
      userId: data.id,
      walletAddress: data.wallet_address,
      monthlyReportsEnabled: data.monthly_reports_enabled,
      preferredCurrency: data.preferred_currency,
      preferredCategories: data.preferred_categories,
      timezone: data.timezone,
      lastReportSent: data.last_report_sent,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  } catch (error) {
    console.error('Error in updateUserPreferences:', error);
    return null;
  }
}

/**
 * Enable monthly reports for a user
 */
export async function enableMonthlyReports(walletAddress: string): Promise<boolean> {
  const result = await updateUserPreferences(walletAddress, {
    monthlyReportsEnabled: true
  });
  return result !== null;
}

/**
 * Disable monthly reports for a user
 */
export async function disableMonthlyReports(walletAddress: string): Promise<boolean> {
  const result = await updateUserPreferences(walletAddress, {
    monthlyReportsEnabled: false
  });
  return result !== null;
}

/**
 * Get all users who have monthly reports enabled and are due for a report
 */
export async function getUsersDueForMonthlyReport(): Promise<UserPreferences[]> {
  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Get first day of current month
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
    
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('monthly_reports_enabled', true)
      .or(`last_report_sent.is.null,last_report_sent.lt.${firstDayOfMonth}`);

    if (error) {
      console.error('Error fetching users due for monthly report:', error);
      return [];
    }

    return data.map(row => ({
      userId: row.id,
      walletAddress: row.wallet_address,
      monthlyReportsEnabled: row.monthly_reports_enabled,
      preferredCurrency: row.preferred_currency,
      preferredCategories: row.preferred_categories,
      timezone: row.timezone,
      lastReportSent: row.last_report_sent,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.error('Error in getUsersDueForMonthlyReport:', error);
    return [];
  }
}

/**
 * Mark monthly report as sent for a user
 */
export async function markMonthlyReportSent(walletAddress: string): Promise<boolean> {
  const result = await updateUserPreferences(walletAddress, {
    lastReportSent: new Date().toISOString()
  });
  return result !== null;
}

/**
 * Parse WhatsApp command for preference updates
 */
export function parsePreferenceCommand(message: string): {
  action: 'enable' | 'disable' | 'status' | 'currency' | 'categories' | null;
  value?: string | string[];
} {
  const lowerMessage = message.toLowerCase().trim();
  
  // Monthly reports commands
  if (lowerMessage.includes('enable monthly') || lowerMessage.includes('turn on monthly') || 
      lowerMessage.includes('start monthly')) {
    return { action: 'enable' };
  }
  
  if (lowerMessage.includes('disable monthly') || lowerMessage.includes('turn off monthly') || 
      lowerMessage.includes('stop monthly')) {
    return { action: 'disable' };
  }
  
  if (lowerMessage.includes('monthly status') || lowerMessage.includes('report status')) {
    return { action: 'status' };
  }
  
  // Currency preference
  if (lowerMessage.includes('currency') && (lowerMessage.includes('usd') || lowerMessage.includes('eur') || 
      lowerMessage.includes('gbp') || lowerMessage.includes('jpy'))) {
    const currencies = ['usd', 'eur', 'gbp', 'jpy'];
    const currency = currencies.find(c => lowerMessage.includes(c));
    return { action: 'currency', value: currency?.toUpperCase() };
  }
  
  // Category preferences
  if (lowerMessage.includes('categories') || lowerMessage.includes('category')) {
    const categories = ['freelance', 'airdrop', 'staking', 'trading', 'defi', 'nft', 'gaming', 'investment'];
    const foundCategories = categories.filter(cat => lowerMessage.includes(cat));
    if (foundCategories.length > 0) {
      return { action: 'categories', value: foundCategories };
    }
  }
  
  return { action: null };
}

/**
 * Generate preference status message for WhatsApp
 */
export function formatPreferenceStatus(preferences: UserPreferences | null): string {
  if (!preferences) {
    return `📊 **Earnings Preferences**\n\n` +
           `Monthly Reports: ❌ Disabled\n` +
           `Currency: USD (default)\n` +
           `Categories: All (default)\n\n` +
           `💡 Send "enable monthly reports" to get automatic monthly summaries!`;
  }
  
  const statusEmoji = preferences.monthlyReportsEnabled ? '✅' : '❌';
  const statusText = preferences.monthlyReportsEnabled ? 'Enabled' : 'Disabled';
  
  let message = `📊 **Earnings Preferences**\n\n`;
  message += `Monthly Reports: ${statusEmoji} ${statusText}\n`;
  message += `Currency: ${preferences.preferredCurrency}\n`;
  
  if (preferences.preferredCategories.length > 0) {
    message += `Categories: ${preferences.preferredCategories.join(', ')}\n`;
  } else {
    message += `Categories: All\n`;
  }
  
  if (preferences.lastReportSent) {
    const lastSent = new Date(preferences.lastReportSent).toLocaleDateString();
    message += `Last Report: ${lastSent}\n`;
  }
  
  message += `\n💡 Commands:\n`;
  message += `• "enable/disable monthly reports"\n`;
  message += `• "set currency USD/EUR/GBP"\n`;
  message += `• "categories freelance airdrop staking"`;
  
  return message;
}