// src/lib/userIdentification.ts - PostHog User Identification Service
import { identifyUser, updateUserProperties, trackEvent } from './posthog';
import TelegramBot from 'node-telegram-bot-api';

/**
 * Service for managing PostHog user identification and profiles
 * Ensures proper user tracking and profile creation
 */
export class UserIdentificationService {
  private static identifiedUsers = new Set<string>();
  public static userCache = new Map<string, TelegramUserProfile>();

  /**
   * Extract user profile from Telegram user object
   */
  static extractUserProfile(telegramUser: TelegramBot.User): TelegramUserProfile {
    return {
      id: telegramUser.id.toString(),
      username: telegramUser.username,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      languageCode: telegramUser.language_code,
      isPremium: (telegramUser as any).is_premium || false,
      isBot: telegramUser.is_bot || false
    };
  }

  /**
   * Identify user in PostHog and create/update their profile
   * Call this when a user first interacts with the bot or when user data changes
   */
  static async identifyTelegramUser(
    telegramUser: TelegramBot.User,
    isNewUser: boolean = false,
    additionalProperties: Record<string, any> = {}
  ): Promise<void> {
    const userId = telegramUser.id.toString();
    const userProfile = this.extractUserProfile(telegramUser);
    
    try {
      // Prepare enhanced user properties for PostHog analytics
      const timestamp = new Date().toISOString();
      const userProperties = {
        // Core Telegram properties
        telegram_id: telegramUser.id,
        username: userProfile.username,
        first_name: userProfile.firstName,
        last_name: userProfile.lastName,
        language_code: userProfile.languageCode,
        is_premium: userProfile.isPremium,
        is_bot: userProfile.isBot,
        
        // Platform identification
        platform: 'telegram',
        source: 'telegram_bot',
        bot_name: 'hedwig',
        
        // Display name for better UX in PostHog
        display_name: this.getDisplayName(userProfile),
        
        // Analytics segmentation properties
        user_type: userProfile.isPremium ? 'premium' : 'free',
        user_tier: this.getUserTier(userProfile),
        language_region: this.getLanguageRegion(userProfile.languageCode),
        has_username: !!userProfile.username,
        has_full_name: !!(userProfile.firstName && userProfile.lastName),
        
        // Engagement tracking (initialized for new users)
        total_sessions: 0,
        total_messages: 0,
        total_commands: 0,
        total_interactions: 0,
        
        // Lifecycle properties
        lifecycle_stage: isNewUser ? 'new' : 'existing',
        first_seen: isNewUser ? timestamp : undefined,
        last_seen: timestamp,
        
        // Behavioral segmentation (initialized)
        engagement_level: 'new',
        activity_frequency: 'unknown',
        preferred_interaction_type: 'unknown',
        
        // Time-based properties
        signup_date: isNewUser ? timestamp : undefined,
        timezone_offset: this.getTimezoneOffset(),
        
        // Additional properties
        ...additionalProperties
      };

      // Identify user in PostHog
      await identifyUser(userId, userProperties, isNewUser);
      
      // Mark user as identified
      this.identifiedUsers.add(userId);
      
      // Cache user profile
      this.userCache.set(userId, userProfile);
      
      console.log(`[UserIdentification] User identified: ${userId} (${this.getDisplayName(userProfile)})`);
      
    } catch (error) {
      console.error('[UserIdentification] Error identifying user:', error);
    }
  }

  /**
   * Update user properties when user data changes
   */
  static async updateTelegramUser(
    telegramUser: TelegramBot.User,
    changedProperties: Record<string, any> = {}
  ): Promise<void> {
    const userId = telegramUser.id.toString();
    const userProfile = this.extractUserProfile(telegramUser);
    const cachedProfile = this.userCache.get(userId);
    
    // Check if user data has changed
    const hasChanges = !cachedProfile || 
      cachedProfile.username !== userProfile.username ||
      cachedProfile.firstName !== userProfile.firstName ||
      cachedProfile.lastName !== userProfile.lastName ||
      cachedProfile.languageCode !== userProfile.languageCode ||
      Object.keys(changedProperties).length > 0;
    
    if (hasChanges) {
      try {
        const updatedProperties = {
          username: userProfile.username,
          first_name: userProfile.firstName,
          last_name: userProfile.lastName,
          language_code: userProfile.languageCode,
          is_premium: userProfile.isPremium,
          display_name: this.getDisplayName(userProfile),
          ...changedProperties
        };
        
        await updateUserProperties(userId, updatedProperties);
        
        // Update cache
        this.userCache.set(userId, userProfile);
        
        console.log(`[UserIdentification] User updated: ${userId}`);
        
      } catch (error) {
        console.error('[UserIdentification] Error updating user:', error);
      }
    }
  }

  /**
   * Ensure user is identified before tracking events
   * Call this before any event tracking to ensure user profile exists
   */
  static async ensureUserIdentified(
    telegramUser: TelegramBot.User,
    isNewUser: boolean = false
  ): Promise<void> {
    const userId = telegramUser.id.toString();
    
    // If user is not yet identified, identify them
    if (!this.identifiedUsers.has(userId)) {
      await this.identifyTelegramUser(telegramUser, isNewUser);
    } else {
      // Update user data if it might have changed
      await this.updateTelegramUser(telegramUser);
    }
  }

  /**
   * Track event with automatic user identification
   * This ensures the user is identified before tracking the event
   */
  static async trackEventWithIdentification(
    telegramUser: TelegramBot.User,
    eventName: string,
    properties: Record<string, any> = {},
    isNewUser: boolean = false
  ): Promise<void> {
    try {
      // Ensure user is identified first
      await this.ensureUserIdentified(telegramUser, isNewUser);
      
      // Track the event
      const userId = telegramUser.id.toString();
      const userProfile = this.extractUserProfile(telegramUser);
      
      await trackEvent(eventName, properties, userId, {
        username: userProfile.username,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        languageCode: userProfile.languageCode,
        isPremium: userProfile.isPremium
      });
      
    } catch (error) {
      console.error('[UserIdentification] Error tracking event with identification:', error);
    }
  }

  /**
   * Get display name for user (for better UX in PostHog)
   */
  private static getDisplayName(userProfile: TelegramUserProfile): string {
    if (userProfile.username) {
      return `@${userProfile.username}`;
    }
    
    const parts: string[] = [];
    if (userProfile.firstName) parts.push(userProfile.firstName);
    if (userProfile.lastName) parts.push(userProfile.lastName);
    
    if (parts.length > 0) {
      return parts.join(' ');
    }
    
    return `User ${userProfile.id}`;
  }

  /**
   * Determine user tier based on profile completeness and premium status
   */
  private static getUserTier(userProfile: TelegramUserProfile): string {
    if (userProfile.isPremium) {
      return 'premium';
    }
    
    let score = 0;
    if (userProfile.username) score += 2;
    if (userProfile.firstName) score += 1;
    if (userProfile.lastName) score += 1;
    
    if (score >= 3) return 'complete_profile';
    if (score >= 2) return 'partial_profile';
    return 'minimal_profile';
  }

  /**
   * Get language region for analytics segmentation
   */
  private static getLanguageRegion(languageCode?: string): string {
    if (!languageCode) return 'unknown';
    
    const regionMap: Record<string, string> = {
      'en': 'english',
      'es': 'spanish',
      'fr': 'french',
      'de': 'german',
      'it': 'italian',
      'pt': 'portuguese',
      'ru': 'russian',
      'zh': 'chinese',
      'ja': 'japanese',
      'ko': 'korean',
      'ar': 'arabic',
      'hi': 'hindi',
      'tr': 'turkish',
      'pl': 'polish',
      'nl': 'dutch',
      'sv': 'swedish',
      'da': 'danish',
      'no': 'norwegian',
      'fi': 'finnish'
    };
    
    return regionMap[languageCode.toLowerCase()] || 'other';
  }

  /**
   * Get timezone offset for time-based analytics
   */
  private static getTimezoneOffset(): number {
    return new Date().getTimezoneOffset();
  }

  /**
   * Update user engagement metrics
   */
  static async updateEngagementMetrics(
    userId: string,
    metrics: {
      sessionIncrement?: number;
      messageIncrement?: number;
      commandIncrement?: number;
      interactionIncrement?: number;
    }
  ): Promise<void> {
    try {
      const updateProperties: Record<string, any> = {};
      
      if (metrics.sessionIncrement) {
        updateProperties.$add = {
          total_sessions: metrics.sessionIncrement
        };
      }
      
      if (metrics.messageIncrement) {
        updateProperties.$add = {
          ...updateProperties.$add,
          total_messages: metrics.messageIncrement,
          total_interactions: metrics.messageIncrement
        };
      }
      
      if (metrics.commandIncrement) {
        updateProperties.$add = {
          ...updateProperties.$add,
          total_commands: metrics.commandIncrement,
          total_interactions: metrics.commandIncrement
        };
      }
      
      if (metrics.interactionIncrement) {
        updateProperties.$add = {
          ...updateProperties.$add,
          total_interactions: metrics.interactionIncrement
        };
      }
      
      // Update last seen
      updateProperties.last_seen = new Date().toISOString();
      
      await updateUserProperties(userId, updateProperties);
      
    } catch (error) {
      console.error('[UserIdentification] Error updating engagement metrics:', error);
    }
  }

  /**
   * Update user behavioral segmentation based on activity patterns
   */
  static async updateBehavioralSegmentation(
    userId: string,
    totalSessions: number,
    totalMessages: number,
    totalCommands: number,
    daysSinceFirstSeen: number
  ): Promise<void> {
    try {
      const totalInteractions = totalMessages + totalCommands;
      
      // Calculate engagement level
      let engagementLevel = 'low';
      if (totalInteractions > 100 || (totalInteractions > 20 && daysSinceFirstSeen < 7)) {
        engagementLevel = 'high';
      } else if (totalInteractions > 20 || (totalInteractions > 5 && daysSinceFirstSeen < 7)) {
        engagementLevel = 'medium';
      }
      
      // Calculate activity frequency
      let activityFrequency = 'rare';
      if (daysSinceFirstSeen > 0) {
        const interactionsPerDay = totalInteractions / daysSinceFirstSeen;
        if (interactionsPerDay > 5) {
          activityFrequency = 'daily';
        } else if (interactionsPerDay > 1) {
          activityFrequency = 'frequent';
        } else if (interactionsPerDay > 0.2) {
          activityFrequency = 'regular';
        }
      }
      
      // Determine preferred interaction type
      let preferredInteractionType = 'unknown';
      if (totalMessages > 0 || totalCommands > 0) {
        const messageRatio = totalMessages / (totalMessages + totalCommands);
        if (messageRatio > 0.7) {
          preferredInteractionType = 'conversational';
        } else if (messageRatio < 0.3) {
          preferredInteractionType = 'command_driven';
        } else {
          preferredInteractionType = 'balanced';
        }
      }
      
      await updateUserProperties(userId, {
        engagement_level: engagementLevel,
        activity_frequency: activityFrequency,
        preferred_interaction_type: preferredInteractionType,
        behavioral_updated_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('[UserIdentification] Error updating behavioral segmentation:', error);
    }
  }

  /**
   * Check if user is already identified
   */
  static isUserIdentified(userId: string): boolean {
    return this.identifiedUsers.has(userId);
  }

  /**
   * Get cached user profile
   */
  static getCachedUserProfile(userId: string): TelegramUserProfile | undefined {
    return this.userCache.get(userId);
  }

  /**
   * Clear identification cache (useful for testing or memory management)
   */
  static clearCache(): void {
    this.identifiedUsers.clear();
    this.userCache.clear();
  }

  /**
   * Get identification statistics
   */
  static getStats(): { identifiedUsers: number; cachedProfiles: number } {
    return {
      identifiedUsers: this.identifiedUsers.size,
      cachedProfiles: this.userCache.size
    };
  }
}

/**
 * Telegram user profile interface
 */
export interface TelegramUserProfile {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  isPremium: boolean;
  isBot: boolean;
}

/**
 * Helper functions for common user identification scenarios
 */
export class UserIdentificationHelpers {
  /**
   * Handle new user registration
   */
  static async handleNewUser(
    telegramUser: TelegramBot.User,
    registrationSource: string = 'bot_start',
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    await UserIdentificationService.identifyTelegramUser(
      telegramUser,
      true, // Mark as new user
      {
        registration_source: registrationSource,
        registration_date: new Date().toISOString(),
        ...additionalData
      }
    );
    
    // Track registration event
    await UserIdentificationService.trackEventWithIdentification(
      telegramUser,
      'user_registered',
      {
        category: 'bot_lifecycle',
        registration_source: registrationSource,
        ...additionalData
      },
      true
    );
  }

  /**
   * Handle user returning to bot
   */
  static async handleReturningUser(
    telegramUser: TelegramBot.User,
    lastSeenDate?: Date
  ): Promise<void> {
    const daysSinceLastSeen = lastSeenDate 
      ? Math.floor((Date.now() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;
    
    await UserIdentificationService.updateTelegramUser(telegramUser, {
      last_return_date: new Date().toISOString(),
      days_since_last_seen: daysSinceLastSeen
    });
    
    // Track return event
    await UserIdentificationService.trackEventWithIdentification(
      telegramUser,
      'user_returned',
      {
        category: 'engagement',
        days_since_last_seen: daysSinceLastSeen,
        is_returning_user: true
      }
    );
  }

  /**
   * Handle user profile updates (when user changes name, username, etc.)
   */
  static async handleProfileUpdate(
    telegramUser: TelegramBot.User,
    changedFields: string[]
  ): Promise<void> {
    await UserIdentificationService.updateTelegramUser(telegramUser, {
      profile_updated_date: new Date().toISOString(),
      updated_fields: changedFields
    });
    
    // Track profile update event
    await UserIdentificationService.trackEventWithIdentification(
      telegramUser,
      'profile_updated',
      {
        category: 'user_management',
        updated_fields: changedFields,
        field_count: changedFields.length
      }
    );
  }
}

/**
 * Standalone utility functions for user identification
 */
export async function ensureUserIdentified(
  telegramUser: TelegramBot.User,
  isNewUser: boolean = false
): Promise<void> {
  await UserIdentificationService.ensureUserIdentified(telegramUser, isNewUser);
}

export async function updateEngagementMetrics(
  userId: string,
  metrics: {
    lastActiveDate?: string;
    sessionCount?: number;
    messageCount?: number;
    commandCount?: number;
    featureUsage?: string[];
  }
): Promise<void> {
  await updateUserProperties(userId, {
    ...metrics,
    last_engagement_update: new Date().toISOString()
  });
}

export async function getUserProperties(
  userId: string
): Promise<TelegramUserProfile | null> {
  return UserIdentificationService.userCache.get(userId) || null;
}

/**
 * Middleware for automatic user identification in message handlers
 */
export class UserIdentificationMiddleware {
  /**
   * Process incoming message and ensure user identification
   */
  static async processMessage(
    msg: TelegramBot.Message,
    isNewUser: boolean = false
  ): Promise<void> {
    if (msg.from) {
      await UserIdentificationService.ensureUserIdentified(msg.from, isNewUser);
    }
  }

  /**
   * Process callback query and ensure user identification
   */
  static async processCallbackQuery(
    query: TelegramBot.CallbackQuery,
    isNewUser: boolean = false
  ): Promise<void> {
    if (query.from) {
      await UserIdentificationService.ensureUserIdentified(query.from, isNewUser);
    }
  }

  /**
   * Process inline query and ensure user identification
   */
  static async processInlineQuery(
    query: TelegramBot.InlineQuery,
    isNewUser: boolean = false
  ): Promise<void> {
    if (query.from) {
      await UserIdentificationService.ensureUserIdentified(query.from, isNewUser);
    }
  }
}