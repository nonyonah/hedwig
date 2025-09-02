/**
 * Analytics Service for Growth Accounting and User Retention
 * Provides high-level analytics functions that work with PostHog
 */

import {
  trackUserActivity,
  trackSessionStart,
  trackUserLifecycle,
  identifyUser,
  updateUserProperties,
  trackEvent
} from './posthog';
import { UserIdentificationService } from './userIdentification';
import TelegramBot from 'node-telegram-bot-api';

export interface UserAnalyticsData {
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  isPremium?: boolean;
  joinDate?: string;
  lastSeen?: string;
  totalSessions?: number;
  totalMessages?: number;
  totalCommands?: number;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  messageCount: number;
  commandCount: number;
  sessionType: string;
}

export interface RetentionMetrics {
  day1Retention: number;
  day7Retention: number;
  day30Retention: number;
  cohortSize: number;
  period: string;
}

/**
 * Analytics Service Class
 * Provides comprehensive analytics tracking for Telegram bot users
 */
export class AnalyticsService {
  public static userSessions = new Map<string, SessionData>();
  private static userLastSeen = new Map<string, string>();

  /**
   * Handle new user registration and lifecycle tracking
   * @param telegramUser - Telegram user object
   * @param registrationSource - Source of registration
   */
  static async handleNewUser(
    telegramUser: TelegramBot.User,
    registrationSource: string = 'bot_start'
  ): Promise<void> {
    try {
      const userId = telegramUser.id.toString();
      const userInfo = {
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        languageCode: telegramUser.language_code,
        isPremium: (telegramUser as any).is_premium || false
      };

      // Identify user with enhanced properties
      await UserIdentificationService.identifyTelegramUser(
        telegramUser,
        true, // Mark as new user
        {
          registration_source: registrationSource,
          acquisition_channel: 'telegram_bot',
          onboarding_completed: false
        }
      );

      // Track as new user lifecycle event
      await trackUserLifecycle(
        userId,
        'new_user',
        userInfo,
        {
          join_date: new Date().toISOString(),
          user_type: 'telegram_user',
          acquisition_source: registrationSource
        }
      );

      // Start initial session
      await this.startUserSession(userId, 'onboarding', userInfo);

      // Track initial activity
      await trackUserActivity(userId, 'user_registration', userInfo);

      // Update engagement metrics
      await UserIdentificationService.updateEngagementMetrics(userId, {
        sessionIncrement: 1,
        interactionIncrement: 1
      });

    } catch (error) {
      console.error('[AnalyticsService] Error handling new user:', error);
    }
  }

  /**
   * Handle returning user and determine lifecycle stage
   * @param telegramUser - Telegram user object
   * @param lastSeenDate - Last seen date (optional)
   */
  static async handleReturningUser(
    telegramUser: TelegramBot.User,
    lastSeenDate?: Date
  ): Promise<void> {
    try {
      const userId = telegramUser.id.toString();
      const userInfo = {
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        languageCode: telegramUser.language_code,
        isPremium: (telegramUser as any).is_premium || false
      };

      // Ensure user is identified with latest data
      await UserIdentificationService.ensureUserIdentified(telegramUser, false);

      const lastSeen = lastSeenDate || this.userLastSeen.get(userId);
      const now = new Date();
      const daysSinceLastSeen = lastSeen 
        ? Math.floor((now.getTime() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      let lifecycleEvent: 'returning_user' | 'reactivated_user' = 'returning_user';
      
      // Consider user reactivated if they haven't been seen for 30+ days
      if (daysSinceLastSeen && daysSinceLastSeen >= 30) {
        lifecycleEvent = 'reactivated_user';
      }

      // Track lifecycle event
      await trackUserLifecycle(
        userId,
        lifecycleEvent,
        userInfo,
        {
          days_since_last_seen: daysSinceLastSeen,
          return_date: now.toISOString()
        }
      );

      // Start session
      await this.startUserSession(userId, 'return_visit', userInfo);

      // Track activity
      await trackUserActivity(userId, 'user_return', userInfo);

      // Update engagement metrics
      await UserIdentificationService.updateEngagementMetrics(userId, {
        sessionIncrement: 1,
        interactionIncrement: 1
      });

      // Update last seen
      this.userLastSeen.set(userId, now.toISOString());

    } catch (error) {
      console.error('[AnalyticsService] Error handling returning user:', error);
    }
  }

  /**
   * Start a user session with comprehensive tracking
   * @param userId - User identifier
   * @param sessionType - Type of session
   * @param userInfo - User information
   */
  static async startUserSession(
    userId: string,
    sessionType: string = 'general',
    userInfo?: { username?: string; firstName?: string; lastName?: string; languageCode?: string; isPremium?: boolean }
  ): Promise<string> {
    try {
      const sessionId = `${userId}_${Date.now()}`;
      const startTime = new Date().toISOString();

      // Create session data
      const sessionData: SessionData = {
        sessionId,
        userId,
        startTime,
        messageCount: 0,
        commandCount: 0,
        sessionType
      };

      this.userSessions.set(sessionId, sessionData);

      // Track session start in PostHog
      await trackSessionStart(userId, sessionType, userInfo);

      return sessionId;
    } catch (error) {
      console.error('[AnalyticsService] Error starting user session:', error);
      return '';
    }
  }

  /**
   * End a user session and calculate metrics
   * @param userId - User identifier
   * @param sessionId - Session identifier (optional, will find active session)
   */
  static async endUserSession(userId: string, sessionId?: string): Promise<void> {
    try {
      // Find active session if sessionId not provided
      let activeSession: SessionData | undefined;
      
      if (sessionId) {
        activeSession = this.userSessions.get(sessionId);
      } else {
        // Find most recent session for user
        for (const [id, session] of this.userSessions.entries()) {
          if (session.userId === userId && !session.endTime) {
            activeSession = session;
            sessionId = id;
            break;
          }
        }
      }

      if (!activeSession || !sessionId) {
        return;
      }

      const endTime = new Date().toISOString();
      const duration = new Date(endTime).getTime() - new Date(activeSession.startTime).getTime();

      // Update session data
      activeSession.endTime = endTime;
      activeSession.duration = duration;

      // Track session end event
      await trackEvent('session_ended', {
        session_id: sessionId,
        session_type: activeSession.sessionType,
        session_duration: duration,
        message_count: activeSession.messageCount,
        command_count: activeSession.commandCount,
        start_time: activeSession.startTime,
        end_time: endTime
      }, userId);

      // Update user properties with session metrics
      await updateUserProperties(userId, {
        last_session_duration: duration,
        last_session_messages: activeSession.messageCount,
        last_session_commands: activeSession.commandCount,
        session_end_time: endTime
      });

      // Remove from active sessions
      this.userSessions.delete(sessionId);

    } catch (error) {
      console.error('[AnalyticsService] Error ending user session:', error);
    }
  }

  /**
   * Track message activity within a session
   * @param telegramUser - Telegram user object
   * @param messageType - Type of message
   * @param messageContent - Message content for analysis (optional)
   */
  static async trackMessage(
    telegramUser: TelegramBot.User,
    messageType: string = 'text',
    messageContent?: string
  ): Promise<void> {
    try {
      const userId = telegramUser.id.toString();
      const userInfo = {
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        languageCode: telegramUser.language_code,
        isPremium: (telegramUser as any).is_premium || false
      };

      // Ensure user is identified
      await UserIdentificationService.ensureUserIdentified(telegramUser, false);

      // Find active session and increment message count
      for (const session of this.userSessions.values()) {
        if (session.userId === userId && !session.endTime) {
          session.messageCount++;
          break;
        }
      }

      // Track message event
      await trackEvent('message_sent', {
        message_type: messageType,
        message_length: messageContent?.length || 0,
        has_content: !!messageContent,
        timestamp: new Date().toISOString()
      }, userId);

      // Track as user activity for DAU/WAU/MAU
      await trackUserActivity(userId, `message_${messageType}`, userInfo);

      // Update engagement metrics
      await UserIdentificationService.updateEngagementMetrics(userId, {
        messageIncrement: 1
      });

    } catch (error) {
      console.error('[AnalyticsService] Error tracking message:', error);
    }
  }

  /**
   * Track command usage within a session
   * @param telegramUser - Telegram user object
   * @param command - Command name
   * @param commandArgs - Command arguments (optional)
   */
  static async trackCommand(
    telegramUser: TelegramBot.User,
    command: string,
    commandArgs?: string[]
  ): Promise<void> {
    try {
      const userId = telegramUser.id.toString();
      const userInfo = {
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        languageCode: telegramUser.language_code,
        isPremium: (telegramUser as any).is_premium || false
      };

      // Ensure user is identified
      await UserIdentificationService.ensureUserIdentified(telegramUser, false);

      // Find active session and increment command count
      for (const session of this.userSessions.values()) {
        if (session.userId === userId && !session.endTime) {
          session.commandCount++;
          break;
        }
      }

      // Track command event
      await trackEvent('command_used', {
        command_name: command,
        command_args_count: commandArgs?.length || 0,
        has_args: !!(commandArgs && commandArgs.length > 0),
        timestamp: new Date().toISOString()
      }, userId);

      // Track as user activity for DAU/WAU/MAU
      await trackUserActivity(userId, `command_${command}`, userInfo);

      // Update engagement metrics
      await UserIdentificationService.updateEngagementMetrics(userId, {
        commandIncrement: 1
      });

    } catch (error) {
      console.error('[AnalyticsService] Error tracking command:', error);
    }
  }

  /**
   * Calculate retention metrics for a given cohort
   * @param cohortStartDate - Start date for the cohort
   * @param cohortEndDate - End date for the cohort
   * @returns Retention metrics
   */
  static async calculateRetentionMetrics(
    cohortStartDate: string,
    cohortEndDate: string
  ): Promise<RetentionMetrics> {
    // Note: This is a simplified implementation
    // In a real scenario, you would query PostHog's API or your database
    // to get actual retention data
    
    return {
      day1Retention: 0.75, // 75% placeholder
      day7Retention: 0.45, // 45% placeholder
      day30Retention: 0.25, // 25% placeholder
      cohortSize: 100, // placeholder
      period: `${cohortStartDate} to ${cohortEndDate}`
    };
  }

  /**
   * Get active session for a user
   * @param userId - User identifier
   * @returns Active session data or null
   */
  static getActiveSession(userId: string): SessionData | null {
    for (const session of this.userSessions.values()) {
      if (session.userId === userId && !session.endTime) {
        return session;
      }
    }
    return null;
  }

  /**
   * Clean up inactive sessions (sessions older than 24 hours without end time)
   */
  static cleanupInactiveSessions(): void {
    const now = new Date().getTime();
    const dayInMs = 24 * 60 * 60 * 1000;

    for (const [sessionId, session] of this.userSessions.entries()) {
      const sessionAge = now - new Date(session.startTime).getTime();
      
      if (!session.endTime && sessionAge > dayInMs) {
        // Auto-end inactive session
        this.endUserSession(session.userId, sessionId);
      }
    }
  }

  /**
   * Get analytics summary for debugging
   * @returns Analytics summary
   */
  static getAnalyticsSummary(): {
    activeSessions: number;
    totalTrackedUsers: number;
    sessionTypes: Record<string, number>;
  } {
    const activeSessions = Array.from(this.userSessions.values()).filter(s => !s.endTime);
    const sessionTypes: Record<string, number> = {};

    for (const session of this.userSessions.values()) {
      sessionTypes[session.sessionType] = (sessionTypes[session.sessionType] || 0) + 1;
    }

    return {
      activeSessions: activeSessions.length,
      totalTrackedUsers: this.userLastSeen.size,
      sessionTypes
    };
  }
}

/**
 * Engagement metrics tracking
 */
export async function trackEngagementMetrics(
  userId: string,
  metrics: {
    sessionDuration?: number;
    messageCount?: number;
    commandCount?: number;
    featureUsage?: string[];
  }
): Promise<void> {
  await trackEvent('engagement_metrics', {
    ...metrics,
    category: 'engagement',
    timestamp: new Date().toISOString()
  }, userId);
}

/**
 * Retention cohort tracking
 */
export async function trackRetentionCohort(
  userId: string,
  cohortData: {
    cohortPeriod: string;
    daysSinceSignup: number;
    isRetained: boolean;
    retentionType: 'day1' | 'day7' | 'day30';
  }
): Promise<void> {
  await trackEvent('retention_cohort', {
    ...cohortData,
    category: 'retention',
    timestamp: new Date().toISOString()
  }, userId);
}

/**
 * Session management functions
 */
export async function startSession(
  userId: string,
  sessionType: string = 'general',
  properties: Record<string, any> = {}
): Promise<string> {
  const sessionId = `${userId}_${Date.now()}`;
  const sessionData: SessionData = {
    sessionId,
    userId,
    startTime: new Date().toISOString(),
    messageCount: 0,
    commandCount: 0,
    sessionType
  };
  
  AnalyticsService.userSessions.set(sessionId, sessionData);
  
  await trackEvent('session_start', {
    ...properties,
    session_id: sessionId,
    session_type: sessionType,
    category: 'session'
  }, userId);
  
  return sessionId;
}

export async function endSession(
  sessionId: string,
  properties: Record<string, any> = {}
): Promise<void> {
  const session = AnalyticsService.userSessions.get(sessionId);
  if (!session) {
    console.warn(`Session ${sessionId} not found`);
    return;
  }
  
  const endTime = new Date().toISOString();
  const duration = new Date(endTime).getTime() - new Date(session.startTime).getTime();
  
  session.endTime = endTime;
  session.duration = duration;
  
  await trackEvent('session_end', {
    ...properties,
    session_id: sessionId,
    session_type: session.sessionType,
    duration: duration,
    message_count: session.messageCount,
    command_count: session.commandCount,
    category: 'session'
  }, session.userId);
}

// Auto-cleanup inactive sessions every hour
setInterval(() => {
  AnalyticsService.cleanupInactiveSessions();
}, 60 * 60 * 1000);

export default AnalyticsService;