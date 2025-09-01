/**
 * PostHog Analytics Service using Direct HTTP API
 * Replaces the PostHog SDK with direct API calls for better reliability
 */

interface PostHogEvent {
  api_key: string;
  event: string;
  distinct_id: string;
  properties: Record<string, any>;
  timestamp?: string;
}

interface PostHogIdentifyEvent {
  api_key: string;
  event: '$identify';
  distinct_id: string;
  properties: Record<string, any>;
  $set?: Record<string, any>;
}

interface PostHogConfig {
  apiKey: string;
  host: string;
  retries: number;
  retryDelay: number;
}

// PostHog configuration
let config: PostHogConfig | null = null;

/**
 * Initialize PostHog configuration
 */
function initializeConfig(): PostHogConfig | null {
  if (config) {
    return config;
  }

  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey) {
    console.warn('[PostHog] API key not configured, analytics disabled');
    return null;
  }

  if (!apiKey.startsWith('phc_')) {
    console.warn('[PostHog] Invalid API key format, should start with "phc_"');
    return null;
  }

  config = {
    apiKey,
    host,
    retries: 3,
    retryDelay: 1000
  };

  console.log('[PostHog] Analytics initialized with direct HTTP API');
  return config;
}

/**
 * Send HTTP request to PostHog with retry logic
 */
async function sendToPostHog(payload: PostHogEvent | PostHogIdentifyEvent, attempt = 1): Promise<boolean> {
  const cfg = initializeConfig();
  if (!cfg) {
    return false;
  }

  const url = `${cfg.host}/capture/`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hedwig-Telegram-Bot/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`[PostHog] Successfully sent event: ${payload.event}`);
      return true;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`[PostHog] Attempt ${attempt} failed:`, error);
    
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
 * Track an event in PostHog
 * @param event - Event name
 * @param properties - Event properties
 * @param userId - User identifier (Telegram ID)
 */
export async function trackEvent(
  event: string,
  properties: Record<string, any> = {},
  userId?: string
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    return;
  }

  try {
    const distinctId = userId || 'anonymous';
    
    const payload: PostHogEvent = {
      api_key: cfg.apiKey,
      event,
      distinct_id: distinctId,
      properties: {
        ...properties,
        context: 'telegram',
        timestamp: new Date().toISOString(),
        source: 'telegram_bot',
        bot_name: 'hedwig'
      },
      timestamp: new Date().toISOString()
    };

    // Send asynchronously without blocking
    sendToPostHog(payload).catch(error => {
      console.error('[PostHog] Async tracking failed:', error);
    });

    console.log(`[PostHog] Queued event: ${event} for user: ${distinctId}`);
  } catch (error) {
    console.error('[PostHog] Error preparing event:', error);
  }
}

/**
 * Identify a user in PostHog with their properties
 * @param userId - User identifier (Telegram ID)
 * @param userProperties - User properties (first_name, username, email, etc.)
 */
export async function identifyUser(
  userId: string,
  userProperties: Record<string, any> = {}
): Promise<void> {
  const cfg = initializeConfig();
  if (!cfg) {
    return;
  }

  try {
    const payload: PostHogIdentifyEvent = {
      api_key: cfg.apiKey,
      event: '$identify',
      distinct_id: userId,
      properties: {
        context: 'telegram',
        platform: 'telegram',
        bot_name: 'hedwig',
        timestamp: new Date().toISOString()
      },
      $set: {
        ...userProperties,
        last_seen: new Date().toISOString()
      }
    };

    // Send asynchronously without blocking
    sendToPostHog(payload).catch(error => {
      console.error('[PostHog] Async identification failed:', error);
    });

    console.log(`[PostHog] Queued user identification: ${userId}`);
  } catch (error) {
    console.error('[PostHog] Error preparing user identification:', error);
  }
}

/**
 * Track specific Hedwig events with standardized properties
 */
export const HedwigEvents = {
  /**
   * Track invoice creation
   */
  invoiceCreated: async (userId: string, invoiceId: string, amount: number, currency: string) => {
    await trackEvent('invoice_created', {
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
      feature: 'invoices',
      ...properties
    }, userId);
  },

  /**
   * Track proposal creation
   */
  proposalCreated: async (userId: string, proposalId: string, title: string, amount: number, currency: string) => {
    await trackEvent('proposal_created', {
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
      feature: 'proposals',
      ...properties
    }, userId);
  },

  /**
   * Track token/crypto sent
   */
  tokensSent: async (userId: string, properties: Record<string, any>) => {
    await trackEvent('tokens_sent', {
      feature: 'payments',
      ...properties
    }, userId);
  },

  /**
   * Track payment link creation
   */
  paymentLinkCreated: async (userId: string, properties: Record<string, any>) => {
    await trackEvent('payment_link_created', {
      feature: 'payments',
      ...properties
    }, userId);
  },

  /**
   * Track wallet connection
   */
  walletConnected: async (userId: string, walletType: string) => {
    await trackEvent('wallet_connected', {
      feature: 'wallet',
      wallet_type: walletType
    }, userId);
  },

  /**
   * Track wallet balance check
   */
  walletBalanceChecked: async (userId: string) => {
    await trackEvent('wallet_balance_checked', {
      feature: 'wallet'
    }, userId);
  },

  /**
   * Track generic feature usage
   */
  featureUsed: async (userId: string, feature: string, action?: string) => {
    await trackEvent('feature_used', {
      feature,
      action
    }, userId);
  }
};

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
  flushEvents,
  shutdownPostHog,
  HedwigEvents
};
