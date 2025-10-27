# Project Notification System

This document describes the comprehensive notification system for project deadlines, milestone achievements, and invoice payments.

## Overview

The notification system automatically monitors projects and sends notifications via email and Telegram for:

- **Deadline Reminders**: 3 days before project deadline
- **Overdue Alerts**: When projects pass their deadline
- **Milestone Completions**: When freelancers complete milestones
- **Invoice Payments**: When clients pay invoices

## Components

### 1. ProjectNotificationService (`src/services/projectNotificationService.ts`)

Handles sending notifications via email and Telegram.

**Key Methods:**
- `sendDeadlineReminder(data, type)` - Send deadline approaching/overdue notifications
- `sendMilestoneAchievement(data)` - Send milestone completion notifications
- `sendInvoicePayment(data)` - Send invoice payment notifications

### 2. ProjectMonitoringService (`src/services/projectMonitoringService.ts`)

Monitors the database for events that require notifications.

**Key Methods:**
- `checkApproachingDeadlines()` - Check for deadlines in next 3 days
- `checkOverdueProjects()` - Check for overdue projects
- `monitorMilestoneCompletions()` - Check for recently completed milestones
- `monitorInvoicePayments()` - Check for recently paid invoices
- `runAllChecks()` - Run all monitoring checks

### 3. Database Schema

**project_notifications table:**
```sql
CREATE TABLE project_notifications (
  id UUID PRIMARY KEY,
  contract_id UUID NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  recipient VARCHAR(20) NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_via_email BOOLEAN DEFAULT false,
  sent_via_telegram BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Endpoints

### Monitoring Endpoint
- **POST** `/api/monitoring/project-notifications`
- Runs all monitoring checks
- Requires `Authorization: Bearer <MONITORING_API_KEY>` header

### Manual Triggers
- **POST** `/api/milestones/[id]/complete` - Mark milestone as complete and send notifications
- **POST** `/api/invoices/[id]/mark-paid` - Mark invoice as paid and send notifications

### Testing Endpoint
- **POST** `/api/test-monitoring` - Test monitoring functions manually

## Setup Instructions

### 1. Environment Variables

Add to your `.env.local`:

```bash
# Monitoring API key for cron job authentication
MONITORING_API_KEY=your-secure-monitoring-key

# Telegram Bot Token (if using Telegram notifications)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Email service (Resend)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=noreply@yourdomain.com
```

### 2. Database Migration

Run the migration to create the notifications table:

```bash
# Apply the migration
supabase db push
```

### 3. Cron Job Setup

#### Option A: Using the setup script (Linux/macOS)

```bash
# Make the script executable
chmod +x scripts/setup-monitoring-cron.sh

# Set environment variables
export NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
export MONITORING_API_KEY="your-secure-monitoring-key"

# Run the setup script
./scripts/setup-monitoring-cron.sh
```

#### Option B: Manual cron setup

Add to your crontab (`crontab -e`):

```bash
# Run monitoring every hour
0 * * * * curl -X POST "https://your-app.vercel.app/api/monitoring/project-notifications" \
  -H "Authorization: Bearer your-monitoring-key" \
  -H "Content-Type: application/json" >> /var/log/hedwig-monitoring.log 2>&1
```

#### Option C: Vercel Cron Jobs

Add to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/monitoring/project-notifications",
      "schedule": "0 * * * *"
    }
  ]
}
```

### 4. Testing

Test the system manually:

```bash
# Test all monitoring checks
curl -X POST "http://localhost:3000/api/test-monitoring" \
  -H "Content-Type: application/json" \
  -d '{"action": "run_all"}'

# Test specific notification
curl -X POST "http://localhost:3000/api/test-monitoring" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "test_deadline_notification",
    "testData": {
      "contractId": "test-id",
      "projectTitle": "Test Project",
      "freelancerEmail": "freelancer@example.com",
      "clientEmail": "client@example.com",
      "amount": 1000,
      "currency": "USDC",
      "deadline": "2024-01-15T00:00:00Z"
    }
  }'
```

## Notification Types

### 1. Deadline Reminders

**Approaching (3 days before):**
- Sent to both freelancer and client
- Reminds about upcoming deadline
- Includes project details and timeline

**Overdue:**
- Sent to both freelancer and client
- Alerts about missed deadline
- Includes days overdue count

### 2. Milestone Achievements

**To Freelancer:**
- Congratulates on milestone completion
- Explains next steps (client review, payment)

**To Client:**
- Notifies of completed milestone
- Requests review and payment approval

### 3. Invoice Payments

**To Freelancer:**
- Confirms payment received
- Shows payment amount and details

**To Client:**
- Confirms payment processed
- Provides payment receipt information

## Email Templates

All email templates are responsive and include:
- Professional Hedwig branding
- Clear call-to-action buttons
- Detailed project information
- Mobile-friendly design

## Telegram Integration

Telegram notifications are sent to users who have:
1. Connected their Telegram account
2. Have a valid `telegram_chat_id` in the users table

Messages include:
- Emoji indicators for quick recognition
- Markdown formatting for readability
- Essential project information
- Action-oriented language

## Monitoring and Logs

### Log Files
- Cron job logs: `/var/log/hedwig-monitoring.log`
- Application logs: Check your hosting platform's logs

### Database Tracking
All notifications are logged in the `project_notifications` table for:
- Audit trail
- Preventing duplicate notifications
- Analytics and reporting

### Monitoring Checks
The system prevents duplicate notifications by checking:
- Notification type and contract ID
- Date range (daily for most notifications)
- Specific milestone/invoice IDs where applicable

## Troubleshooting

### Common Issues

1. **Notifications not sending**
   - Check environment variables
   - Verify API keys (Resend, Telegram)
   - Check database connectivity

2. **Duplicate notifications**
   - System should prevent this automatically
   - Check `project_notifications` table for duplicates
   - Verify cron job isn't running multiple times

3. **Cron job not running**
   - Check cron service is running: `systemctl status cron`
   - Verify cron job syntax: `crontab -l`
   - Check log files for errors

4. **API authentication errors**
   - Verify `MONITORING_API_KEY` matches in environment and cron job
   - Check API endpoint is accessible

### Debug Commands

```bash
# Check cron jobs
crontab -l

# Test API endpoint manually
curl -X POST "https://your-app.vercel.app/api/monitoring/project-notifications" \
  -H "Authorization: Bearer your-monitoring-key" \
  -H "Content-Type: application/json"

# View monitoring logs
tail -f /var/log/hedwig-monitoring.log

# Test database connection
psql -h your-db-host -U your-user -d your-database -c "SELECT COUNT(*) FROM project_notifications;"
```

## Performance Considerations

- Monitoring runs hourly to balance timeliness with resource usage
- Database queries are optimized with proper indexes
- Notifications are batched to avoid rate limits
- Failed notifications don't block the entire monitoring process

## Security

- API endpoint requires authentication token
- Database access uses service role with proper RLS policies
- Sensitive information is not logged in plain text
- Email addresses are validated before sending

## Future Enhancements

Potential improvements:
- SMS notifications via Twilio
- Slack integration
- Custom notification preferences per user
- Advanced scheduling (different times for different notification types)
- Analytics dashboard for notification metrics
- Webhook support for third-party integrations