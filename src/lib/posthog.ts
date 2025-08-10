import PostHog from 'posthog-node';

// Type workaround for posthog-node default import
const PostHogClient = (PostHog as any).default || PostHog;

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_HOST = process.env.POSTHOG_PROJECT_HOST || 'https://app.posthog.com';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Only initialize PostHog in production
export const posthog =
  IS_PRODUCTION && POSTHOG_API_KEY
    ? new PostHogClient(POSTHOG_API_KEY, { host: POSTHOG_PROJECT_HOST })
    : null;

export function trackEvent(event: string, properties: Record<string, any> = {}) {
  if (posthog) {
    posthog.capture({
      distinctId: properties.distinctId || 'anonymous',
      event,
      properties,
    });
  } else {
    // No-op in non-production
  }
}
