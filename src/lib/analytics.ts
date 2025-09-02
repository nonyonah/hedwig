// src/lib/analytics.ts - Analytics Helper Utilities
import { HedwigEvents } from './posthog';
import { UserIdentificationService, UserIdentificationMiddleware } from './userIdentification';
import TelegramBot from 'node-telegram-bot-api';

/**
 * Analytics middleware for Telegram bot messages
 * Automatically tracks message types and basic engagement
 */
export class AnalyticsMiddleware {
  private static userSessions = new Map<string, {
    startTime: Date;
    messagesCount: number;
    commandsUsed: string[];
    lastActivity: Date;
  }>();

  /**
   * Track incoming message and update user session
   */
  static async trackMessage(msg: TelegramBot.Message, userId?: string, isNewUser: boolean = false) {
    try {
      // Ensure user identification first
      if (msg.from) {
        await UserIdentificationMiddleware.processMessage(msg, isNewUser);
        userId = msg.from.id.toString();
      }
      
      if (!userId) {
        console.warn('[Analytics] Cannot track message without user ID');
        return;
      }

      // Determine message type
      const messageType = AnalyticsMiddleware.getMessageType(msg);
      
      // Track message received with user identification
      if (msg.from) {
        await UserIdentificationService.trackEventWithIdentification(
          msg.from,
          'message_received',
          {
            category: 'messages',
            message_type: messageType,
            chat_type: msg.chat.type,
            message_id: msg.message_id,
            has_reply: !!msg.reply_to_message,
            has_forward: !!msg.forward_from,
            has_media: AnalyticsMiddleware.hasMedia(msg)
          },
          isNewUser
        );
      }

      // Update user session
      AnalyticsMiddleware.updateUserSession(userId, msg);

      // Track text message analysis if it's a text message
      if (msg.text && messageType === 'text') {
        await AnalyticsMiddleware.analyzeTextMessage(userId, msg.text, msg.from);
      }

    } catch (error) {
      console.error('[Analytics] Error tracking message:', error);
    }
  }

  /**
   * Track command usage
   */
  static async trackCommand(msg: TelegramBot.Message, command: string, userId?: string, success: boolean = true, isNewUser: boolean = false) {
    try {
      // Ensure user identification first
      if (msg.from) {
        await UserIdentificationMiddleware.processMessage(msg, isNewUser);
        userId = msg.from.id.toString();
      }
      
      if (!userId || !msg.from) {
        console.warn('[Analytics] Cannot track command without user information');
        return;
      }

      // Track command with user identification
      await UserIdentificationService.trackEventWithIdentification(
        msg.from,
        'command_used',
        {
          category: 'commands',
          command: command,
          messageId: msg.message_id,
          chatType: msg.chat.type,
          success
        },
        isNewUser
      );

      // Update session with command usage
      const session = AnalyticsMiddleware.userSessions.get(userId);
      if (session) {
        session.commandsUsed.push(command);
        session.lastActivity = new Date();
      }
    } catch (error) {
      console.error('[Analytics] Error tracking command:', error);
    }
  }

  /**
   * Track command completion
   */
  static async trackCommandCompletion(telegramUser: TelegramBot.User, command: string, result: 'success' | 'error' | 'cancelled', details?: Record<string, any>) {
    try {
      await UserIdentificationService.trackEventWithIdentification(
        telegramUser,
        'command_completed',
        {
          category: 'commands',
          command: command,
          result: result,
          ...details
        }
      );
    } catch (error) {
      console.error('[Analytics] Error tracking command completion:', error);
    }
  }

  /**
   * Track user session start
   */
  static async startUserSession(telegramUser: TelegramBot.User, source: string = 'direct') {
    try {
      const userId = telegramUser.id.toString();
      const existingSession = this.userSessions.get(userId);
      const previousSessionGap = existingSession 
        ? Math.floor((Date.now() - existingSession.lastActivity.getTime()) / (1000 * 60 * 60)) // hours
        : undefined;

      await UserIdentificationService.trackEventWithIdentification(
        telegramUser,
        'session_started',
        {
          category: 'engagement',
          source,
          previousSessionGap
        }
      );

      // Initialize new session
      AnalyticsMiddleware.userSessions.set(userId, {
        startTime: new Date(),
        messagesCount: 0,
        commandsUsed: [],
        lastActivity: new Date()
      });
    } catch (error) {
      console.error('[Analytics] Error starting user session:', error);
    }
  }

  /**
   * Analyze text message content
   */
  private static async analyzeTextMessage(userId: string, text: string, telegramUser?: TelegramBot.User) {
    try {
      const analysis = {
        length: text.length,
        word_count: text.split(/\s+/).length,
        has_emoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(text),
        has_url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/.test(text),
        has_mention: /@\w+/.test(text),
        has_hashtag: /#\w+/.test(text),
        language_detected: 'unknown' // Could integrate with language detection service
      };

      if (telegramUser) {
        await UserIdentificationService.trackEventWithIdentification(
          telegramUser,
          'text_message_analyzed',
          {
            category: 'messages',
            ...analysis
          }
        );
      }
    } catch (error) {
      console.error('[Analytics] Error analyzing text message:', error);
    }
  }

  /**
   * Get message type from Telegram message
   */
  private static getMessageType(msg: TelegramBot.Message): string {
    if (msg.text) return 'text';
    if (msg.photo) return 'photo';
    if (msg.video) return 'video';
    if (msg.audio) return 'audio';
    if (msg.voice) return 'voice';
    if (msg.document) return 'document';
    if (msg.sticker) return 'sticker';
    if (msg.animation) return 'animation';
    if (msg.location) return 'location';
    if (msg.contact) return 'contact';
    if (msg.poll) return 'poll';
    if (msg.venue) return 'venue';
    return 'other';
  }

  /**
   * Check if message has media
   */
  private static hasMedia(msg: TelegramBot.Message): boolean {
    return !!(msg.photo || msg.video || msg.audio || msg.voice || 
             msg.document || msg.sticker || msg.animation);
  }

  /**
   * Update user session data
   */
  private static updateUserSession(userId: string, msg: TelegramBot.Message) {
    const session = AnalyticsMiddleware.userSessions.get(userId);
    if (session) {
      session.messagesCount++;
      session.lastActivity = new Date();
    } else {
      // Create new session if it doesn't exist
      AnalyticsMiddleware.userSessions.set(userId, {
        startTime: new Date(),
        messagesCount: 1,
        commandsUsed: [],
        lastActivity: new Date()
      });
    }
  }

  /**
   * Track bot start event
   */
  static async trackBotStart(telegramUser: TelegramBot.User, isNewUser: boolean = false) {
    try {
      await UserIdentificationService.trackEventWithIdentification(
        telegramUser,
        'bot_started',
        {
          category: 'bot_lifecycle',
          is_new_user: isNewUser
        },
        isNewUser
      );
    } catch (error) {
      console.error('[Analytics] Error tracking bot start:', error);
    }
  }

  /**
   * Track error events
   */
  static async trackError(telegramUser: TelegramBot.User, error: Error, context: string, additionalData?: Record<string, any>) {
    try {
      await UserIdentificationService.trackEventWithIdentification(
        telegramUser,
        'error_occurred',
        {
          category: 'errors',
          error_message: error.message,
          error_name: error.name,
          context: context,
          stack_trace: error.stack?.substring(0, 500), // Limit stack trace length
          ...additionalData
        }
      );
    } catch (trackingError) {
      console.error('[Analytics] Error tracking error event:', trackingError);
    }
  }

  /**
   * Track API errors
   */
  static async trackApiError(telegramUser: TelegramBot.User, endpoint: string, method: string, statusCode: number, errorMessage: string) {
    try {
      await UserIdentificationService.trackEventWithIdentification(
        telegramUser,
        'api_error',
        {
          category: 'errors',
          endpoint: endpoint,
          method: method,
          status_code: statusCode,
          error_message: errorMessage
        }
      );
    } catch (error) {
      console.error('[Analytics] Error tracking API error:', error);
    }
  }

  /**
   * Track user input errors
   */
  static async trackUserInputError(telegramUser: TelegramBot.User, command: string, expectedFormat: string, actualInput: string, errorMessage: string) {
    try {
      await UserIdentificationService.trackEventWithIdentification(
        telegramUser,
        'user_input_error',
        {
          category: 'errors',
          command: command,
          expected_format: expectedFormat,
          actual_input: actualInput.substring(0, 100), // Limit input length
          error_message: errorMessage
        }
      );
    } catch (error) {
      console.error('[Analytics] Error tracking user input error:', error);
    }
  }



  /**
   * Track user session end
   */
  static async endUserSession(userId: string) {
    try {
      const session = AnalyticsMiddleware.userSessions.get(userId);
    if (session) {
      const duration = Math.floor((Date.now() - session.startTime.getTime()) / (1000 * 60)); // minutes
      
      await HedwigEvents.sessionEnded(userId, {
        duration,
        messagesCount: session.messagesCount,
        commandsUsed: session.commandsUsed
      });

      AnalyticsMiddleware.userSessions.delete(userId);
    }
    } catch (error) {
      console.error('[Analytics] Error ending user session:', error);
    }
  }

  // Note: trackBotStart, trackError, trackApiError, and trackUserInputError methods are already defined above





  // Note: updateUserSession method is already defined above



  /**
   * Helper: Basic intent detection
   */
  private static detectIntent(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('help') || lowerText.includes('?')) return 'help_request';
    if (lowerText.includes('send') || lowerText.includes('transfer')) return 'send_intent';
    if (lowerText.includes('balance') || lowerText.includes('wallet')) return 'balance_inquiry';
    if (lowerText.includes('invoice') || lowerText.includes('bill')) return 'invoice_intent';
    if (lowerText.includes('proposal') || lowerText.includes('quote')) return 'proposal_intent';
    if (lowerText.includes('withdraw') || lowerText.includes('cash out')) return 'withdrawal_intent';
    if (lowerText.includes('error') || lowerText.includes('problem')) return 'error_report';
    if (lowerText.includes('thank') || lowerText.includes('thanks')) return 'gratitude';
    if (lowerText.startsWith('/')) return 'command';
    
    return 'general';
  }

  /**
   * Helper: Basic entity extraction
   */
  private static extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    // Extract amounts (numbers with currency symbols)
    if (/\$\d+|\d+\s*(usd|usdc|eth|btc|sol)/i.test(text)) entities.push('amount');
    
    // Extract addresses (basic pattern)
    if (/0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{25,34}/.test(text)) entities.push('address');
    
    // Extract emails
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text)) entities.push('email');
    
    // Extract URLs
    if (/https?:\/\/[^\s]+/.test(text)) entities.push('url');
    
    return entities;
  }

  /**
   * Helper: Basic sentiment detection
   */
  private static detectSentiment(text: string): string {
    const lowerText = text.toLowerCase();
    
    const positiveWords = ['good', 'great', 'awesome', 'perfect', 'thanks', 'thank you', 'excellent', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'awful', 'error', 'problem', 'issue', 'broken', 'failed', 'wrong'];
    
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Clean up inactive sessions (call periodically)
   */
  static cleanupInactiveSessions(inactiveThresholdMinutes: number = 30) {
    const now = Date.now();
    const threshold = inactiveThresholdMinutes * 60 * 1000;
    
    for (const [userId, session] of AnalyticsMiddleware.userSessions.entries()) {
      if (now - session.lastActivity.getTime() > threshold) {
        AnalyticsMiddleware.endUserSession(userId);
      }
    }
  }
}

/**
 * Transaction tracking helpers
 */
export class TransactionAnalytics {
  /**
   * Track transaction initiation
   */
  static async trackTransactionStart(userId: string, type: string, amount?: number, currency?: string, recipient?: string) {
    try {
      await HedwigEvents.transactionInitiated(userId, {
        type,
        amount,
        currency,
        recipient
      });
    } catch (error) {
      console.error('[TransactionAnalytics] Error tracking transaction start:', error);
    }
  }

  /**
   * Track transaction completion
   */
  static async trackTransactionComplete(userId: string, type: string, amount: number, currency: string, success: boolean, txHash?: string) {
    try {
      await HedwigEvents.transactionCompleted(userId, {
        type,
        amount,
        currency,
        success,
        txHash
      });

      // Track revenue event if successful
      if (success && amount > 0) {
        await HedwigEvents.revenueEvent(userId, {
          amount,
          currency,
          source: 'transaction',
          type
        });
      }
    } catch (error) {
      console.error('[TransactionAnalytics] Error tracking transaction completion:', error);
    }
  }
}

/**
 * Feature usage tracking helpers
 */
export class FeatureAnalytics {
  /**
   * Track feature usage with automatic categorization
   */
  static async trackFeature(userId: string, feature: string, action: string, details?: Record<string, any>) {
    try {
      await HedwigEvents.featureUsed(userId, feature, action, details);
    } catch (error) {
      console.error('[FeatureAnalytics] Error tracking feature usage:', error);
    }
  }

  /**
   * Track conversion events
   */
  static async trackConversion(userId: string, from: string, to: string, value?: number, context?: string) {
    try {
      await HedwigEvents.conversionEvent(userId, {
        from,
        to,
        value,
        context
      });
    } catch (error) {
      console.error('[FeatureAnalytics] Error tracking conversion:', error);
    }
  }
}

/**
 * Retention and engagement tracking
 */
export class EngagementAnalytics {
  /**
   * Track user activity patterns
   */
  static async trackActivity(userId: string, activityType: string) {
    try {
      const now = new Date();
      const timeOfDay = this.getTimeOfDay(now);
      const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
      
      await HedwigEvents.userActivity(userId, {
        type: activityType,
        timeOfDay,
        dayOfWeek
      });
    } catch (error) {
      console.error('[EngagementAnalytics] Error tracking activity:', error);
    }
  }

  /**
   * Track retention milestones
   */
  static async trackMilestone(userId: string, type: string, value: number, unit: string) {
    try {
      await HedwigEvents.retentionMilestone(userId, {
        type,
        value,
        unit
      });
    } catch (error) {
      console.error('[EngagementAnalytics] Error tracking milestone:', error);
    }
  }

  /**
   * Helper: Get time of day category
   */
  private static getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }
}

// Export all analytics utilities
export default {
  AnalyticsMiddleware,
  TransactionAnalytics,
  FeatureAnalytics,
  EngagementAnalytics
};