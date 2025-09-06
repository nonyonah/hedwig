/**
 * PostHog Dashboard Setup Script
 * Creates insights for Daily Active Users, Weekly Active Users, Retention, and Growth Accounting
 */

import { config } from 'dotenv';
import { trackEvent, trackUserActivity, identifyUser } from '../lib/posthog';

// Load environment variables from .env.local
config({ path: '.env.local' });

// PostHog API configuration
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

interface PostHogInsight {
  name: string;
  description?: string;
  query: {
    kind: string;
    series?: Array<{
      event: string;
      name?: string;
      math?: string;
      math_property?: string;
    }>;
    interval?: string;
    date_range?: {
      date_from: string;
      date_to?: string;
    };
    breakdown?: {
      breakdown: string;
      breakdown_type: string;
    };
    // Retention query specific fields
    target_entity?: {
      id: string;
      name: string;
      type: string;
    };
    returning_entity?: {
      id: string;
      name: string;
      type: string;
    };
    retention_type?: string;
    period?: string;
    // Lifecycle query specific fields
    events?: Array<{
      id: string;
      name?: string;
      type?: string;
      order?: number;
    }>;
  };
}

/**
 * Create PostHog insights for the dashboard
 */
export async function createPostHogInsights() {
  if (!POSTHOG_API_KEY || !PROJECT_ID) {
    console.error('❌ PostHog API key or Project ID not configured');
    console.error('Please set the following environment variables:');
    console.error('- POSTHOG_API_KEY: Your PostHog Personal API Key');
    console.error('- POSTHOG_PROJECT_ID: Your PostHog Project ID');
    console.error('\nSee POSTHOG_SETUP.md for detailed instructions.');
    return;
  }
  
  console.log('🔧 Creating PostHog insights with proper DAU/WAU and retention configurations...');

  const insights: PostHogInsight[] = [
    // Daily Active Users - using Telegram bot events
    {
      name: 'Daily Active Users (DAU)',
      description: 'Number of unique Telegram bot users active each day',
      query: {
        kind: 'TrendsQuery',
        series: [{
          event: 'bot_started',
          name: 'Daily Active Users',
          math: 'dau'
        }],
        interval: 'day',
        date_range: {
          date_from: '-30d'
        }
      }
    },
    
    // Weekly Active Users
    {
      name: 'Weekly Active Users (WAU)',
      description: 'Number of unique Telegram bot users active each week',
      query: {
        kind: 'TrendsQuery',
        series: [{
          event: 'bot_started',
          name: 'Weekly Active Users',
          math: 'weekly_active'
        }],
        interval: 'week',
        date_range: {
          date_from: '-12w'
        }
      }
    },
    
    // Monthly Active Users
    {
      name: 'Monthly Active Users (MAU)',
      description: 'Number of unique Telegram bot users active each month',
      query: {
        kind: 'TrendsQuery',
        series: [{
          event: 'bot_started',
          name: 'Monthly Active Users',
          math: 'monthly_active'
        }],
        interval: 'month',
        date_range: {
          date_from: '-6m'
        }
      }
    },
    
    // User Retention - Telegram Bot
    {
      name: 'User Retention',
      description: 'Percentage of Telegram bot users who return after their first interaction',
      query: {
        kind: 'RetentionQuery',
        target_entity: {
          id: 'bot_started',
          name: 'Bot Started',
          type: 'events'
        },
        returning_entity: {
          id: 'bot_started', 
          name: 'Bot Started',
          type: 'events'
        },
        date_range: {
          date_from: '-8w'
        },
        retention_type: 'retention_first_time',
        period: 'Week'
      }
    },
    
    // Growth Accounting (Lifecycle) - Telegram Bot
    {
      name: 'Growth Accounting',
      description: 'New, returning, resurrected, and dormant Telegram bot users',
      query: {
        kind: 'LifecycleQuery',
        series: [{
          event: 'bot_started',
          name: 'Bot Activity'
        }],
        interval: 'week',
        date_range: {
          date_from: '-12w'
        }
      }
    },
    
    // Command Usage Trends - Telegram Bot
    {
      name: 'Command Usage Trends',
      description: 'Most popular Telegram bot commands over time',
      query: {
        kind: 'TrendsQuery',
        series: [{
          event: 'command_used',
          name: 'Command Usage'
        }],
        interval: 'day',
        date_range: {
          date_from: '-30d'
        },
        breakdown: {
          breakdown: 'activity_type',
          breakdown_type: 'event'
        }
      }
    }
  ];

  console.log('Creating PostHog insights for dashboard...');
  
  for (const insight of insights) {
    try {
      const response = await fetch(`${POSTHOG_HOST}/api/projects/${PROJECT_ID}/insights/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${POSTHOG_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: insight.name,
          description: insight.description,
          query: insight.query,
          filters: insight.query // Legacy format support
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Created insight: ${insight.name} (ID: ${result.id})`);
      } else {
        const error = await response.text();
        console.error(`❌ Failed to create insight: ${insight.name}`, error);
      }
    } catch (error) {
      console.error(`❌ Error creating insight: ${insight.name}`, error);
    }
  }
}

/**
 * Create a dashboard with the insights
 */
export async function createPostHogDashboard() {
  if (!POSTHOG_API_KEY || !PROJECT_ID) {
    console.error('❌ PostHog API key or Project ID not configured');
    return null;
  }
  
  console.log('📊 Creating PostHog dashboard...');

  try {
    const response = await fetch(`${POSTHOG_HOST}/api/projects/${PROJECT_ID}/dashboards/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${POSTHOG_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Hedwig Analytics Dashboard',
        description: 'Main analytics dashboard for Hedwig Telegram bot with DAU, WAU, retention, and growth metrics',
        pinned: true
      })
    });
    
    if (response.ok) {
      const dashboard = await response.json();
      console.log(`✅ Created dashboard: ${dashboard.name} (ID: ${dashboard.id})`);
      return dashboard.id;
    } else {
      const error = await response.text();
      console.error('❌ Failed to create dashboard:', error);
    }
  } catch (error) {
    console.error('❌ Error creating dashboard:', error);
  }
}

/**
 * Main setup function
 */
export async function setupPostHogDashboard() {
  console.log('🚀 Setting up PostHog dashboard...');
  
  // Create insights first
  await createPostHogInsights();
  
  // Create dashboard
  const dashboardId = await createPostHogDashboard();
  
  if (dashboardId) {
    console.log('✅ PostHog dashboard setup completed!');
    console.log(`📊 Dashboard URL: ${POSTHOG_HOST}/project/${PROJECT_ID}/dashboard/${dashboardId}`);
  }
}

// Run setup if called directly
// Run the setup when this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('setup-posthog-dashboard.ts')) {
  setupPostHogDashboard().catch(console.error);
}