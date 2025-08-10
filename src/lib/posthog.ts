import PostHog from 'posthog-node';

// Type workaround for posthog-node default import
const PostHogClient = (PostHog as any).default || PostHog;

const NEXT_PUBLIC_POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
const NEXT_PUBLIC_POSTHOG_PROJECT_HOST = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_HOST || 'https://eu.i.posthog.com';
// PostHog analytics is disabled in all environments
// This disables event tracking for privacy or debugging purposes

/**
 * Track an event in PostHog (disabled)
 */
export function trackEvent(event: string, properties: Record<string, any> = {}) {
  // No-op: analytics disabled
}
