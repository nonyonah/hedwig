// PostHog analytics is disabled in all environments
// This disables event tracking for privacy or debugging purposes

/**
 * Track an event in PostHog (disabled)
 */
export function trackEvent(event: string, properties: Record<string, any> = {}) {
  // No-op: analytics disabled
}
