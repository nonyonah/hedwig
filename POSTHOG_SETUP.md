# PostHog Dashboard Setup Guide

This guide explains how to configure PostHog analytics dashboard to display Daily Active Users (DAU), Weekly Active Users (WAU), retention metrics, and growth accounting for the Hedwig Telegram bot.

## Prerequisites

1. **PostHog Account**: You need a PostHog account with API access
2. **Environment Variables**: Configure the required PostHog environment variables
3. **Node.js**: Ensure you have Node.js installed to run the setup script

## Required Environment Variables

Add these environment variables to your `.env.local` file:

```env
# PostHog Configuration
POSTHOG_API_KEY=your_posthog_personal_api_key_here
POSTHOG_PROJECT_ID=your_posthog_project_id_here
POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_API_KEY=your_posthog_public_api_key_here
```

### How to Get These Values:

1. **POSTHOG_API_KEY**: 
   - Go to PostHog → Settings → Personal API Keys
   - Create a new personal API key with dashboard and insight permissions

2. **POSTHOG_PROJECT_ID**: 
   - Go to PostHog → Settings → Project
   - Copy the Project ID from the project settings

3. **NEXT_PUBLIC_POSTHOG_API_KEY**: 
   - Go to PostHog → Settings → Project API Keys
   - Copy your project's public API key

## Dashboard Setup

### Automatic Setup (Recommended)

Run the automated setup script to create all necessary insights and dashboard:

```bash
# Using npm script
npm run setup-posthog

# Or using the direct runner
node setup-posthog.js
```

This script will create:
- **Daily Active Users (DAU)** - Unique users active each day
- **Weekly Active Users (WAU)** - Unique users active each week  
- **Monthly Active Users (MAU)** - Unique users active each month
- **User Retention** - Percentage of users who return after first visit
- **Growth Accounting** - New, returning, resurrected, and dormant users
- **Command Usage Trends** - Most popular bot commands over time

### Manual Setup

If you prefer to set up manually:

1. **Go to PostHog Dashboard**
2. **Create New Dashboard**: Click "New Dashboard" and name it "Hedwig Analytics"
3. **Add Insights**: For each metric, click "Add Insight" and configure:

#### Daily Active Users (DAU)
- **Type**: Trends
- **Event**: `$pageview`
- **Math**: `Unique users`
- **Interval**: Day
- **Date Range**: Last 30 days

#### Weekly Active Users (WAU)
- **Type**: Trends
- **Event**: `$pageview`
- **Math**: `Weekly Active Users`
- **Interval**: Week
- **Date Range**: Last 12 weeks

#### User Retention
- **Type**: Retention
- **Event**: `$pageview`
- **Cohort**: Users who performed event
- **Return**: Users who came back to perform event
- **Date Range**: Last 8 weeks

#### Growth Accounting
- **Type**: Lifecycle
- **Event**: `$pageview`
- **Interval**: Week
- **Date Range**: Last 12 weeks

## Troubleshooting

### Dashboard Shows No Data

1. **Check Event Tracking**: Ensure user activity is being tracked properly
2. **Verify Environment Variables**: Make sure all PostHog env vars are set correctly
3. **Check API Permissions**: Ensure your API key has the necessary permissions
4. **Wait for Data**: It may take a few hours for data to appear in PostHog

### Common Issues

- **"No data" message**: Users need to interact with the bot to generate events
- **API errors**: Check that your API key and project ID are correct
- **Missing insights**: Run the setup script again or create insights manually

## Event Tracking Implementation

The bot now tracks user activity in two places:

1. **Message Handler** (`webhook.ts`): Tracks all user messages and interactions
2. **Command Handler** (`webhook.ts`): Tracks specific command usage

Events sent to PostHog include:
- User ID (Telegram chat ID)
- Activity type (message, command)
- Command name (for commands)
- User attributes (username, first name, etc.)

## Accessing Your Dashboard

After setup, access your dashboard at:
```
https://us.i.posthog.com/project/YOUR_PROJECT_ID/dashboard/DASHBOARD_ID
```

The setup script will output the direct URL when completed.

## Next Steps

1. **Monitor Metrics**: Check your dashboard regularly for user engagement trends
2. **Set Up Alerts**: Configure PostHog alerts for significant metric changes
3. **Custom Events**: Add more specific event tracking for detailed analytics
4. **A/B Testing**: Use PostHog's feature flags for bot feature testing

---

**Note**: This setup requires users to interact with the bot to generate meaningful analytics data. The more users engage, the more comprehensive your analytics will become.