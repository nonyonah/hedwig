/**
 * PostHog Analytics Service using Direct HTTP API
 * Fixed implementation for reliable event tracking in Telegram bot
 */

interface PostHogEvent {
  api_key: string;
  event: string;
  distinct_id: string;
  project_id?: string;
  properties?: Record<string, any>;
  timestamp?: string;
}

interface PostHogBatchEvent {
  api_key: string;
  project_id?: string;
  batch: PostHogEvent[];
}

interface PostHogIdentifyEvent {
  api_key: string;
  event: '$identify';
  distinct_id: string;
  project_id?: string;
  properties?: Record<string, any>;
  $set?: Record<string, any>;
}

interface PostHogConfig {
  apiKey: string;
  host: string;
  endpoint: string;
  batchEndpoint: string;
  retries: number;
  retryDelay: number;
  debug: boolean;
}

// PostHog configuration
let config: PostHogConfig | null = null;

/**
 * Initialize PostHog configuration with proper endpoints
 */
function initializeConfig(): PostHogConfig | null {
  if (config) {
    return config;
  }

  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
  const debug = process.env.NODE_ENV === 'development';

  if (!apiKey) {
    console.warn('[PostHog] API key not configured, analytics disabled');
    return null;
  }

  if (!apiKey.startsWith('phc_')) {
    console.warn('[PostHog] Invalid API key format, should start with "phc_"');
    return null;
  }

  // Determine correct endpoints based on host
  let endpoint: string;
  let batchEndpoint: string;
  
  if (host.includes('eu.i.posthog.com')) {
    endpoint = 'https://eu.i.posthog.com/i/v0/e/';
    batchEndpoint = 'https://eu.i.posthog.com/batch/';
  } else if (host.includes('us.i.posthog.com')) {
    endpoint = 'https://us.i.posthog.com/i/v0/e/';
    batchEndpoint = 'https://us.i.posthog.com/batch/';
  } else if (host.includes('app.posthog.com')) {
    // Legacy app.posthog.com - redirect to US cloud
    endpoint = 'https://us.i.posthog.com/i/v0/e/';
    batchEndpoint = 'https://us.i.posthog.com/batch/';
  } else {
    // Self-hosted instance
    endpoint = `${host}/i/v0/e/`;
    batchEndpoint = `${host}/batch/`;
  }

  config = {
    apiKey,
    host,
    endpoint,
    batchEndpoint,
    retries: 3,
    retryDelay: 1000,
    debug
  };

  if (debug) {
    console.log('[PostHog] Analytics initialized with configuration:', {
      host,
      endpoint,
      batchEndpoint,
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    });
  }
  
  return config;
}

/**
 * Send HTTP request to PostHog with retry logic and detailed debugging
 */
async function sendToPostHog(payload: PostHogEvent | PostHogIdentifyEvent, attempt = 1): Promise<boolean> {
  const cfg = initializeConfig();
  if (!cfg) {
    return false;
  }

  // Use the correct endpoint for single events
  const url = cfg.endpoint;
  
  // Validate payload before sending
  if (!payload.event || !payload.distinct_id) {
    console.error('[PostHog] Invalid payload - missing required fields:', {
      hasEvent: !!payload.event,
      hasDistinctId: !!payload.distinct_id,
      event: payload.event,
      distinctId: payload.distinct_id
    });
    return false;
  }

  if (cfg.debug) {
    console.log(`[PostHog] Sending to: ${url}`);
    console.log(`[PostHog] Payload:`, JSON.stringify(payload, null, 2));
  }
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hedwig-Telegram-Bot/1.0'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    
    if (cfg.debug) {
      console.log(`[PostHog] Response status: ${response.status}`);
      console.log(`[PostHog] Response headers:`, Object.fromEntries(response.headers.entries()));
      console.log(`[PostHog] Response body:`, responseText);
    }

    if (response.ok) {
      console.log(`[PostHog] Successfully sent event: ${payload.event} for user: ${payload.distinct_id}`);
      return true;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${responseText}`);
    }
  } catch (error) {
    console.error(`[PostHog] Attempt ${attempt} failed for event '${payload.event}':`, error);
    
    // Retry with exponential backoff
    if (attempt < cfg.retries) {
      const delay = cfg.retryDelay * Math.pow(2, attempt - 1);
      console.log(`[PostHog] Retrying in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendToPostHog(payload, attempt + 1);
    }
    
    console.error(`[PostHog] Failed to send event after ${cfg.retries} attempts`);
    return false;
  }
}

/**
 * Send batch events to PostHog (fallback method)
 */
async function sendBatchToPostHog(events: PostHogEvent[]): Promise<boolean> {
  const cfg = initializeConfig();
  if (!cfg) {
    return false;
  }

  const payload: PostHogBatchEvent = {
    api_key: cfg.apiKey,
    project_id: process.env.POSTHOG_PROJECT_ID,
    batch: events
  };

  if (cfg.debug) {
    console.log(`[PostHog] Sending batch to: ${cfg.batchEndpoint}`);
    console.log(`[PostHog] Batch payload:`, JSON.stringify(payload, null, 2));
  }

  try {
    const response = await fetch(cfg.batchEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hedwig-Telegram-Bot/1.0'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    
    if (cfg.debug) {
      console.log(`[PostHog] Batch response status: ${response.status}`);
      console.log(`[PostHog] Batch response:`, responseText);
    }

    if (response.ok) {
      console.log(`[PostHog] Successfully sent batch of ${events.length} events`);
      return true;
    } else {
      throw new Error(`Batch HTTP ${response.status}: ${response.statusText}. Response: ${responseText}`);
    }
  } catch (error) {
    console.error('[PostHog] Batch sending failed:', error);
    return false;
  }
}

/**
 * Track an event in PostHog with improved error handling and user identification
 * @param event - Event name (required, non-empty string)
 * @param properties - Event properties (optional)
 * @param userId - User identifier (Telegram ID, required for proper tracking)
 * @param userInfo - User information for identification (optional, used for first-time users)
 */
export async function trackEvent(
  event: string,
  properties: Record<string, any> = {},
  userId?: string,
  userInfo?: { username?: string; firstName?: string; lastName?: string; languageCode?: string; isPremium?: boolean }
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    console.warn('[PostHog] Tracking disabled - configuration not available');
    return;
  }

  // Validate required parameters
  if (!event || typeof event !== 'string' || event.trim() === '') {
    console.error('[PostHog] Invalid event name:', event);
    return;
  }

  // Require userId for proper user tracking
  if (!userId) {
    console.warn('[PostHog] No userId provided for event:', event, '- Event will be anonymous');
    return; // Don't track anonymous events to avoid cluttering data
  }

  try {
    const timestamp = new Date().toISOString();
    
    // If userInfo is provided, identify the user first
    if (userInfo) {
      await identifyUser(userId, {
        username: userInfo.username,
        first_name: userInfo.firstName,
        last_name: userInfo.lastName,
        language_code: userInfo.languageCode,
        is_premium: userInfo.isPremium || false,
        platform: 'telegram'
      }, true); // Mark as new user if userInfo is provided
    }
    
    const payload: PostHogEvent = {
      api_key: cfg.apiKey,
      event: event.trim(),
      distinct_id: userId,
      project_id: process.env.POSTHOG_PROJECT_ID,
      properties: {
        ...properties,
        // Standard context properties
        $lib: 'hedwig-telegram-bot',
        $lib_version: '1.0.0',
        context: 'telegram',
        source: 'telegram_bot',
        bot_name: 'hedwig',
        timestamp: timestamp,
        // Add user agent for better tracking
        $user_agent: 'Hedwig-Telegram-Bot/1.0',
        // Ensure user profile is processed
        $process_person_profile: true,
        // Add user context if available
        ...(userInfo && {
          user_username: userInfo.username,
          user_first_name: userInfo.firstName,
          user_language: userInfo.languageCode
        })
      },
      timestamp: timestamp
    };

    if (cfg.debug) {
      console.log(`[PostHog] Preparing to track event: ${event} for user: ${userId}`);
    }

    // Try single event first, fallback to batch if it fails
    const success = await sendToPostHog(payload);
    
    if (!success) {
      if (cfg.debug) {
        console.log('[PostHog] Single event failed, trying batch method...');
      }
      await sendBatchToPostHog([payload]);
    }

  } catch (error) {
    console.error('[PostHog] Error preparing/sending event:', error);
  }
}

/**
 * Identify a user in PostHog with their properties
 * This creates a user profile and sets user properties
 * @param userId - User identifier (Telegram ID)
 * @param userProperties - User properties (first_name, username, email, etc.)
 * @param isNewUser - Whether this is a new user registration
 */
export async function identifyUser(
  userId: string,
  userProperties: Record<string, any> = {},
  isNewUser: boolean = false
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    return;
  }

  if (!userId || typeof userId !== 'string') {
    console.error('[PostHog] Invalid userId for identification:', userId);
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    
    // Create identify event payload
    const identifyPayload: PostHogIdentifyEvent = {
      api_key: cfg.apiKey,
      event: '$identify',
      distinct_id: userId,
      project_id: process.env.POSTHOG_PROJECT_ID,
      properties: {
        $lib: 'hedwig-telegram-bot',
        $lib_version: '1.0.0',
        context: 'telegram',
        platform: 'telegram',
        bot_name: 'hedwig',
        timestamp: timestamp,
        $process_person_profile: true // Ensure user profile is created
      },
      $set: {
        // Core user properties
        platform: 'telegram',
        bot_name: 'hedwig',
        last_seen: timestamp,
        is_telegram_user: true,
        ...userProperties,
        // Set creation time for new users
        ...(isNewUser && { created_at: timestamp, first_seen: timestamp })
      }
    };

    if (cfg.debug) {
      console.log(`[PostHog] Identifying user: ${userId}`, {
        isNewUser,
        properties: Object.keys(userProperties)
      });
    }

    // Send identify event
    const success = await sendToPostHog(identifyPayload);
    
    if (success) {
      if (cfg.debug) {
        console.log(`[PostHog] User identified successfully: ${userId}`);
      }
    } else {
      // Fallback to batch method
      if (cfg.debug) {
        console.log('[PostHog] Single identify failed, trying batch method...');
      }
      await sendBatchToPostHog([identifyPayload]);
    }

  } catch (error) {
    console.error('[PostHog] Error identifying user:', error);
  }
}

/**
 * Update user properties without creating a new identify event
 * Use this for updating existing user properties
 * @param userId - User identifier
 * @param properties - Properties to update
 */
export async function updateUserProperties(
  userId: string,
  properties: Record<string, any>
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    return;
  }

  if (!userId || typeof userId !== 'string') {
    console.error('[PostHog] Invalid userId for property update:', userId);
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    
    const updatePayload: PostHogIdentifyEvent = {
      api_key: cfg.apiKey,
      event: '$identify',
      distinct_id: userId,
      properties: {
        $lib: 'hedwig-telegram-bot',
        $lib_version: '1.0.0',
        context: 'telegram',
        timestamp: timestamp,
        $process_person_profile: true
      },
      $set: {
        last_seen: timestamp,
        ...properties
      }
    };

    if (cfg.debug) {
      console.log(`[PostHog] Updating properties for user: ${userId}`, Object.keys(properties));
    }

    const success = await sendToPostHog(updatePayload);
    
    if (!success) {
      await sendBatchToPostHog([updatePayload]);
    }

  } catch (error) {
    console.error('[PostHog] Error updating user properties:', error);
  }
}

/**
 * Enhanced analytics tracking functions for dashboard metrics
 */

/**
 * Track user activity for DAU/WAU/MAU analytics
 * This function ensures users appear in active user metrics
 * @param userId - User identifier
 * @param activityType - Type of activity (message, command, interaction)
 * @param userInfo - User information for identification
 */
export async function trackUserActivity(
  userId: string,
  activityType: string = 'general',
  userInfo?: { username?: string; firstName?: string; lastName?: string; languageCode?: string; isPremium?: boolean }
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];
    
    // Identify user if info provided
    if (userInfo) {
      await identifyUser(userId, {
        username: userInfo.username,
        first_name: userInfo.firstName,
        last_name: userInfo.lastName,
        language_code: userInfo.languageCode,
        is_premium: userInfo.isPremium || false,
        platform: 'telegram'
      });
    }

    // Track activity event for DAU/WAU/MAU
    const activityPayload: PostHogEvent = {
      api_key: cfg.apiKey,
      event: '$pageview', // PostHog uses $pageview for active user tracking
      distinct_id: userId,
      properties: {
        $lib: 'hedwig-telegram-bot',
        $lib_version: '1.0.0',
        context: 'telegram',
        source: 'telegram_bot',
        bot_name: 'hedwig',
        activity_type: activityType,
        activity_date: today,
        timestamp: timestamp,
        $process_person_profile: true,
        // Essential for analytics dashboards
        $current_url: `telegram://bot/hedwig/${activityType}`,
        $host: 'telegram.hedwig.bot',
        $pathname: `/${activityType}`,
        // User context
        ...(userInfo && {
          user_username: userInfo.username,
          user_first_name: userInfo.firstName,
          user_language: userInfo.languageCode
        })
      },
      timestamp: timestamp
    };

    const success = await sendToPostHog(activityPayload);
    
    if (!success) {
      await sendBatchToPostHog([activityPayload]);
    }

    // Also update user's last activity
    await updateUserProperties(userId, {
      last_activity: timestamp,
      last_activity_type: activityType,
      last_activity_date: today
    });

  } catch (error) {
    console.error('[PostHog] Error tracking user activity:', error);
  }
}

/**
 * Track user session start for session-based analytics
 * @param userId - User identifier
 * @param sessionType - Type of session (bot_start, message, command)
 * @param userInfo - User information
 */
export async function trackSessionStart(
  userId: string,
  sessionType: string = 'general',
  userInfo?: { username?: string; firstName?: string; lastName?: string; languageCode?: string; isPremium?: boolean }
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    const sessionId = `${userId}_${Date.now()}`;
    
    // Identify user if info provided
    if (userInfo) {
      await identifyUser(userId, {
        username: userInfo.username,
        first_name: userInfo.firstName,
        last_name: userInfo.lastName,
        language_code: userInfo.languageCode,
        is_premium: userInfo.isPremium || false,
        platform: 'telegram'
      });
    }

    // Track session start
    const sessionPayload: PostHogEvent = {
      api_key: cfg.apiKey,
      event: 'session_started',
      distinct_id: userId,
      properties: {
        $lib: 'hedwig-telegram-bot',
        $lib_version: '1.0.0',
        context: 'telegram',
        source: 'telegram_bot',
        bot_name: 'hedwig',
        session_id: sessionId,
        session_type: sessionType,
        timestamp: timestamp,
        $process_person_profile: true,
        // Session tracking properties
        $session_id: sessionId,
        $session_start_timestamp: timestamp,
        // User context
        ...(userInfo && {
          user_username: userInfo.username,
          user_first_name: userInfo.firstName,
          user_language: userInfo.languageCode
        })
      },
      timestamp: timestamp
    };

    const success = await sendToPostHog(sessionPayload);
    
    if (!success) {
      await sendBatchToPostHog([sessionPayload]);
    }

    // Update user properties with session info
    await updateUserProperties(userId, {
      current_session_id: sessionId,
      session_start_time: timestamp,
      session_type: sessionType
    });

    // Also track as user activity for DAU/WAU/MAU
    await trackUserActivity(userId, `session_${sessionType}`, userInfo);

  } catch (error) {
    console.error('[PostHog] Error tracking session start:', error);
  }
}

/**
 * Track user lifecycle events for retention analysis
 * @param userId - User identifier
 * @param lifecycleEvent - Event type (new_user, returning_user, churned_user, reactivated_user)
 * @param userInfo - User information
 * @param additionalProperties - Additional event properties
 */
export async function trackUserLifecycle(
  userId: string,
  lifecycleEvent: 'new_user' | 'returning_user' | 'churned_user' | 'reactivated_user',
  userInfo?: { username?: string; firstName?: string; lastName?: string; languageCode?: string; isPremium?: boolean },
  additionalProperties: Record<string, any> = {}
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    
    // Identify user if info provided
    if (userInfo) {
      await identifyUser(userId, {
        username: userInfo.username,
        first_name: userInfo.firstName,
        last_name: userInfo.lastName,
        language_code: userInfo.languageCode,
        is_premium: userInfo.isPremium || false,
        platform: 'telegram'
      }, lifecycleEvent === 'new_user');
    }

    // Track lifecycle event
    const lifecyclePayload: PostHogEvent = {
      api_key: cfg.apiKey,
      event: `user_${lifecycleEvent}`,
      distinct_id: userId,
      properties: {
        $lib: 'hedwig-telegram-bot',
        $lib_version: '1.0.0',
        context: 'telegram',
        source: 'telegram_bot',
        bot_name: 'hedwig',
        lifecycle_stage: lifecycleEvent,
        timestamp: timestamp,
        $process_person_profile: true,
        // User context
        ...(userInfo && {
          user_username: userInfo.username,
          user_first_name: userInfo.firstName,
          user_language: userInfo.languageCode
        }),
        ...additionalProperties
      },
      timestamp: timestamp
    };

    const success = await sendToPostHog(lifecyclePayload);
    
    if (!success) {
      await sendBatchToPostHog([lifecyclePayload]);
    }

    // Update user lifecycle properties
    await updateUserProperties(userId, {
      lifecycle_stage: lifecycleEvent,
      lifecycle_updated_at: timestamp,
      ...(lifecycleEvent === 'new_user' && { first_seen: timestamp }),
      ...(lifecycleEvent === 'returning_user' && { last_return: timestamp })
    });

    // Track as user activity for analytics
    await trackUserActivity(userId, `lifecycle_${lifecycleEvent}`, userInfo);

  } catch (error) {
    console.error('[PostHog] Error tracking user lifecycle:', error);
  }
}

/**
 * Track specific Hedwig events with standardized properties
 */
export const HedwigEvents = {
  // === BOT LIFECYCLE EVENTS ===
  /**
   * Track when user starts the bot
   */
  botStarted: async (userId: string, userInfo?: { username?: string; firstName?: string; lastName?: string; languageCode?: string }) => {
    await trackEvent('bot_started', {
      category: 'bot_lifecycle',
      user_username: userInfo?.username,
      user_first_name: userInfo?.firstName,
      user_last_name: userInfo?.lastName,
      user_language: userInfo?.languageCode,
      is_new_user: false // This should be set based on whether user exists in DB
    }, userId);
  },

  /**
   * Track when user stops/blocks the bot
   */
  botStopped: async (userId: string, reason?: string) => {
    await trackEvent('bot_stopped', {
      category: 'bot_lifecycle',
      reason: reason || 'unknown'
    }, userId);
  },

  /**
   * Track new user registration
   */
  userRegistered: async (userId: string, userInfo: { username?: string; firstName?: string; lastName?: string; languageCode?: string }) => {
    await trackEvent('user_registered', {
      category: 'bot_lifecycle',
      user_username: userInfo.username,
      user_first_name: userInfo.firstName,
      user_last_name: userInfo.lastName,
      user_language: userInfo.languageCode
    }, userId);
  },

  // === COMMAND TRACKING ===
  /**
   * Track command usage
   */
  commandUsed: async (userId: string, command: string, context?: { messageId?: number; chatType?: string; success?: boolean }) => {
    await trackEvent('command_used', {
      category: 'commands',
      command: command.replace('/', ''), // Remove slash for cleaner data
      chat_type: context?.chatType || 'private',
      command_success: context?.success !== false,
      message_id: context?.messageId
    }, userId);
  },

  /**
   * Track command completion/result
   */
  commandCompleted: async (userId: string, command: string, result: 'success' | 'error' | 'cancelled', details?: Record<string, any>) => {
    await trackEvent('command_completed', {
      category: 'commands',
      command: command.replace('/', ''),
      result,
      ...details
    }, userId);
  },

  // === MESSAGE TYPE TRACKING ===
  /**
   * Track different types of messages received
   */
  messageReceived: async (userId: string, messageType: string, details?: Record<string, any>) => {
    await trackEvent('message_received', {
      category: 'messages',
      message_type: messageType, // text, photo, document, sticker, voice, etc.
      ...details
    }, userId);
  },

  /**
   * Track text message content analysis
   */
  textMessageAnalyzed: async (userId: string, analysis: { intent?: string; entities?: string[]; sentiment?: string; length?: number }) => {
    await trackEvent('text_message_analyzed', {
      category: 'messages',
      intent: analysis.intent,
      entities: analysis.entities?.join(','),
      sentiment: analysis.sentiment,
      message_length: analysis.length
    }, userId);
  },

  // === USER ENGAGEMENT PATTERNS ===
  /**
   * Track user session start
   */
  sessionStarted: async (userId: string, context?: { source?: string; previousSessionGap?: number }) => {
    await trackEvent('session_started', {
      category: 'engagement',
      source: context?.source || 'direct',
      previous_session_gap_hours: context?.previousSessionGap
    }, userId);
  },

  /**
   * Track user session end
   */
  sessionEnded: async (userId: string, sessionData: { duration?: number; messagesCount?: number; commandsUsed?: string[] }) => {
    await trackEvent('session_ended', {
      category: 'engagement',
      session_duration_minutes: sessionData.duration,
      messages_count: sessionData.messagesCount,
      commands_used: sessionData.commandsUsed?.join(','),
      commands_count: sessionData.commandsUsed?.length || 0
    }, userId);
  },

  /**
   * Track user activity patterns
   */
  userActivity: async (userId: string, activity: { type: string; frequency?: string; timeOfDay?: string; dayOfWeek?: string }) => {
    await trackEvent('user_activity', {
      category: 'engagement',
      activity_type: activity.type,
      frequency: activity.frequency,
      time_of_day: activity.timeOfDay,
      day_of_week: activity.dayOfWeek
    }, userId);
  },

  /**
   * Track user retention milestones
   */
  retentionMilestone: async (userId: string, milestone: { type: string; value: number; unit: string }) => {
    await trackEvent('retention_milestone', {
      category: 'engagement',
      milestone_type: milestone.type, // days_active, commands_used, transactions_completed
      milestone_value: milestone.value,
      milestone_unit: milestone.unit
    }, userId);
  },

  // === FEATURE USAGE TRACKING ===
  /**
   * Track invoice creation
   */
  invoiceCreated: async (userId: string, invoiceId: string, amount: number, currency: string) => {
    await trackEvent('invoice_created', {
      category: 'features',
      feature: 'invoices',
      invoice_id: invoiceId,
      amount,
      currency
    }, userId);
  },

  /**
   * Track invoice sent to client
   */
  invoiceSent: async (userId: string, properties: Record<string, any>) => {
    await trackEvent('invoice_sent', {
      category: 'features',
      feature: 'invoices',
      ...properties
    }, userId);
  },

  /**
   * Track proposal creation
   */
  proposalCreated: async (userId: string, proposalId: string, title: string, amount: number, currency: string) => {
    await trackEvent('proposal_created', {
      category: 'features',
      feature: 'proposals',
      proposal_id: proposalId,
      title,
      amount,
      currency
    }, userId);
  },

  /**
   * Track proposal sent to client
   */
  proposalSent: async (userId: string, properties: Record<string, any>) => {
    await trackEvent('proposal_sent', {
      category: 'features',
      feature: 'proposals',
      ...properties
    }, userId);
  },

  /**
   * Track token/crypto sent
   */
  tokensSent: async (userId: string, properties: Record<string, any>) => {
    await trackEvent('tokens_sent', {
      category: 'features',
      feature: 'payments',
      ...properties
    }, userId);
  },

  /**
   * Track payment link creation
   */
  paymentLinkCreated: async (userId: string, properties: Record<string, any>) => {
    await trackEvent('payment_link_created', {
      category: 'features',
      feature: 'payments',
      ...properties
    }, userId);
  },

  /**
   * Track wallet connection
   */
  walletConnected: async (userId: string, walletType: string) => {
    await trackEvent('wallet_connected', {
      category: 'features',
      feature: 'wallet',
      wallet_type: walletType
    }, userId);
  },

  /**
   * Track wallet balance check
   */
  walletBalanceChecked: async (userId: string) => {
    await trackEvent('wallet_balance_checked', {
      category: 'features',
      feature: 'wallet'
    }, userId);
  },

  /**
   * Track transaction events
   */
  transactionInitiated: async (userId: string, transaction: { type: string; amount?: number; currency?: string; recipient?: string }) => {
    await trackEvent('transaction_initiated', {
      category: 'features',
      feature: 'transactions',
      transaction_type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      has_recipient: !!transaction.recipient
    }, userId);
  },

  transactionCompleted: async (userId: string, transaction: { type: string; amount: number; currency: string; txHash?: string; success: boolean }) => {
    await trackEvent('transaction_completed', {
      category: 'features',
      feature: 'transactions',
      transaction_type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      success: transaction.success,
      has_tx_hash: !!transaction.txHash
    }, userId);
  },

  /**
   * Track offramp/withdrawal usage
   */
  offrampInitiated: async (userId: string, details: { amount?: number; currency?: string; method?: string }) => {
    await trackEvent('offramp_initiated', {
      category: 'features',
      feature: 'offramp',
      amount: details.amount,
      currency: details.currency,
      withdrawal_method: details.method
    }, userId);
  },

  offrampCompleted: async (userId: string, details: { amount: number; currency: string; method: string; success: boolean }) => {
    await trackEvent('offramp_completed', {
      category: 'features',
      feature: 'offramp',
      amount: details.amount,
      currency: details.currency,
      withdrawal_method: details.method,
      success: details.success
    }, userId);
  },

  /**
   * Track generic feature usage
   */
  featureUsed: async (userId: string, feature: string, action?: string, details?: Record<string, any>) => {
    await trackEvent('feature_used', {
      category: 'features',
      feature,
      action,
      ...details
    }, userId);
  },

  // === ERROR TRACKING ===
  /**
   * Track application errors
   */
  errorOccurred: async (userId: string, error: { type: string; message: string; code?: string; context?: string; stack?: string }) => {
    await trackEvent('error_occurred', {
      category: 'errors',
      error_type: error.type,
      error_message: error.message,
      error_code: error.code,
      error_context: error.context,
      has_stack_trace: !!error.stack
    }, userId);
  },

  /**
   * Track API errors
   */
  apiError: async (userId: string, apiError: { endpoint: string; method: string; statusCode: number; message: string }) => {
    await trackEvent('api_error', {
      category: 'errors',
      api_endpoint: apiError.endpoint,
      http_method: apiError.method,
      status_code: apiError.statusCode,
      error_message: apiError.message
    }, userId);
  },

  /**
   * Track validation errors
   */
  validationError: async (userId: string, validation: { field: string; value?: string; rule: string; context?: string }) => {
    await trackEvent('validation_error', {
      category: 'errors',
      validation_field: validation.field,
      validation_rule: validation.rule,
      validation_context: validation.context,
      has_value: !!validation.value
    }, userId);
  },

  /**
   * Track user input errors
   */
  userInputError: async (userId: string, inputError: { command?: string; expectedFormat: string; actualInput: string; suggestion?: string }) => {
    await trackEvent('user_input_error', {
      category: 'errors',
      command: inputError.command,
      expected_format: inputError.expectedFormat,
      input_length: inputError.actualInput?.length || 0,
      has_suggestion: !!inputError.suggestion
    }, userId);
  },

  // === BUSINESS METRICS ===
  /**
   * Track revenue-generating events
   */
  revenueEvent: async (userId: string, revenue: { amount: number; currency: string; source: string; type: string }) => {
    await trackEvent('revenue_event', {
      category: 'business',
      revenue_amount: revenue.amount,
      revenue_currency: revenue.currency,
      revenue_source: revenue.source,
      revenue_type: revenue.type
    }, userId);
  },

  /**
   * Track conversion events
   */
  conversionEvent: async (userId: string, conversion: { from: string; to: string; value?: number; context?: string }) => {
    await trackEvent('conversion_event', {
      category: 'business',
      conversion_from: conversion.from,
      conversion_to: conversion.to,
      conversion_value: conversion.value,
      conversion_context: conversion.context
    }, userId);
  }
};

/**
 * Test PostHog configuration and connectivity
 * Use this function to debug PostHog integration issues
 */
export async function testPostHogConnection(userId: string = 'test_user'): Promise<{
  success: boolean;
  errors: string[];
  config: any;
  testResults: any;
}> {
  const errors: string[] = [];
  const testResults: any = {};
  
  console.log('\n=== PostHog Connection Test ===');
  
  // Test 1: Configuration
  const cfg = initializeConfig();
  if (!cfg) {
    errors.push('PostHog configuration failed - check POSTHOG_API_KEY and POSTHOG_HOST environment variables');
    return { success: false, errors, config: null, testResults };
  }
  
  console.log('✅ Configuration loaded successfully');
  testResults.config = {
    host: cfg.host,
    endpoint: cfg.endpoint,
    batchEndpoint: cfg.batchEndpoint,
    apiKeyPrefix: cfg.apiKey.substring(0, 8) + '...',
    debug: cfg.debug
  };
  
  // Test 2: Simple event tracking
  console.log('\n🧪 Testing simple event...');
  try {
    const testEvent: PostHogEvent = {
      api_key: cfg.apiKey,
      event: 'posthog_connection_test',
      distinct_id: userId,
      properties: {
        test: true,
        timestamp: new Date().toISOString(),
        source: 'connection_test'
      },
      timestamp: new Date().toISOString()
    };
    
    const singleEventSuccess = await sendToPostHog(testEvent);
    testResults.singleEvent = { success: singleEventSuccess };
    
    if (singleEventSuccess) {
      console.log('✅ Single event test passed');
    } else {
      console.log('❌ Single event test failed');
      errors.push('Single event API call failed');
    }
  } catch (error) {
    console.log('❌ Single event test error:', error);
    errors.push(`Single event error: ${error}`);
    testResults.singleEvent = { success: false, error: String(error) };
  }
  
  // Test 3: Batch event tracking
  console.log('\n🧪 Testing batch events...');
  try {
    const batchEvents: PostHogEvent[] = [
      {
        api_key: cfg.apiKey,
        event: 'posthog_batch_test_1',
        distinct_id: userId,
        properties: { test: true, batch_index: 1 },
        timestamp: new Date().toISOString()
      },
      {
        api_key: cfg.apiKey,
        event: 'posthog_batch_test_2',
        distinct_id: userId,
        properties: { test: true, batch_index: 2 },
        timestamp: new Date().toISOString()
      }
    ];
    
    const batchSuccess = await sendBatchToPostHog(batchEvents);
    testResults.batchEvent = { success: batchSuccess };
    
    if (batchSuccess) {
      console.log('✅ Batch event test passed');
    } else {
      console.log('❌ Batch event test failed');
      errors.push('Batch event API call failed');
    }
  } catch (error) {
    console.log('❌ Batch event test error:', error);
    errors.push(`Batch event error: ${error}`);
    testResults.batchEvent = { success: false, error: String(error) };
  }
  
  // Test 4: trackEvent function
  console.log('\n🧪 Testing trackEvent function...');
  try {
    await trackEvent('posthog_function_test', {
      test: true,
      function_test: true
    }, userId);
    
    testResults.trackEventFunction = { success: true };
    console.log('✅ trackEvent function test completed');
  } catch (error) {
    console.log('❌ trackEvent function test error:', error);
    errors.push(`trackEvent function error: ${error}`);
    testResults.trackEventFunction = { success: false, error: String(error) };
  }
  
  const success = errors.length === 0;
  
  console.log('\n=== Test Summary ===');
  if (success) {
    console.log('🎉 All PostHog tests passed!');
    console.log('📊 Check your PostHog dashboard for test events in 2-5 minutes');
    console.log('🔍 Look for events: posthog_connection_test, posthog_batch_test_1, posthog_batch_test_2, posthog_function_test');
  } else {
    console.log('❌ PostHog tests failed:');
    errors.forEach(error => console.log(`   - ${error}`));
  }
  
  return {
    success,
    errors,
    config: testResults.config,
    testResults
  };
}

/**
 * Daily/Weekly/Monthly Active User tracking functions
 */
export async function trackDAU(
  userId: string,
  properties: Record<string, any> = {}
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await trackEvent('daily_active_user', {
    ...properties,
    date: today,
    category: 'engagement',
    metric_type: 'dau'
  }, userId);
}

export async function trackWAU(
  userId: string,
  properties: Record<string, any> = {}
): Promise<void> {
  const now = new Date();
  const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
  const weekKey = weekStart.toISOString().split('T')[0];
  
  await trackEvent('weekly_active_user', {
    ...properties,
    week_start: weekKey,
    category: 'engagement',
    metric_type: 'wau'
  }, userId);
}

export async function trackMAU(
  userId: string,
  properties: Record<string, any> = {}
): Promise<void> {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  await trackEvent('monthly_active_user', {
    ...properties,
    month: monthKey,
    category: 'engagement',
    metric_type: 'mau'
  }, userId);
}

/**
 * Legacy compatibility functions (no-op for graceful migration)
 */
export async function flushEvents(): Promise<void> {
  // No-op: HTTP API calls are immediate
  console.log('[PostHog] Flush called (no-op with HTTP API)');
}

export async function shutdownPostHog(): Promise<void> {
  // No-op: No persistent connections with HTTP API
  console.log('[PostHog] Shutdown called (no-op with HTTP API)');
}

// Export default for backward compatibility
export default {
  trackEvent,
  identifyUser,
  updateUserProperties,
  trackDAU,
  trackWAU,
  trackMAU,
  testPostHogConnection,
  flushEvents,
  shutdownPostHog,
  HedwigEvents
};
