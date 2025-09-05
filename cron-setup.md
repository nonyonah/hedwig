# Hedwig Invoice Reminder System - Cron Job Setup

This document explains how to set up automated reminders for the Hedwig invoice system.

## Overview

The system now supports two types of automated reminders:
1. **Smart Nudges** - Existing system based on `viewed_at` timestamps
2. **Due Date Reminders** - New system based on invoice due dates

## API Endpoints

### Individual Endpoints
- `POST /api/process-nudges` - Process smart nudges only
- `POST /api/process-due-date-reminders` - Process due date reminders only
- `POST /api/process-all-reminders` - Process both systems (recommended)

### Authentication
All endpoints require authorization header:
```
Authorization: Bearer YOUR_CRON_SECRET
```

Use either `CRON_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` environment variable.

## Recommended Cron Schedule

### Option 1: Comprehensive Daily Processing (Recommended)
```bash
# Run all reminders daily at 9 AM UTC
0 9 * * * curl -X POST "https://your-domain.com/api/process-all-reminders" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Option 2: Separate Processing
```bash
# Smart nudges every 6 hours
0 */6 * * * curl -X POST "https://your-domain.com/api/process-nudges" \
  -H "Authorization: Bearer $CRON_SECRET"

# Due date reminders daily at 9 AM UTC
0 9 * * * curl -X POST "https://your-domain.com/api/process-due-date-reminders" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Platform-Specific Setup

### Vercel Cron Jobs
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/process-all-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### GitHub Actions
Create `.github/workflows/reminders.yml`:
```yaml
name: Process Reminders
on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  process-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Process All Reminders
        run: |
          curl -X POST "${{ secrets.APP_URL }}/api/process-all-reminders" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

### Traditional Cron (Linux/macOS)
Add to crontab (`crontab -e`):
```bash
# Process all reminders daily at 9 AM UTC
0 9 * * * /usr/bin/curl -X POST "https://your-domain.com/api/process-all-reminders" -H "Authorization: Bearer YOUR_CRON_SECRET" -H "Content-Type: application/json" >> /var/log/hedwig-reminders.log 2>&1
```

## Due Date Reminder Logic

The system automatically sends reminders:
- **3 days before** due date
- **On** the due date
- **3 days after** due date (overdue)

### Smart Filtering
- Only sends one reminder per day per invoice
- Skips invoices already paid
- Skips invoices without due dates
- Tracks all attempts in `invoice_reminder_logs` table

## Environment Variables Required

```env
# Authentication
CRON_SECRET=your-secure-cron-secret
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-key

# Email Service
RESEND_API_KEY=your-resend-api-key

# Database
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-key

# App URL
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Monitoring and Logs

### API Response Format
```json
{
  "success": true,
  "nudges": {
    "sent": 5,
    "failed": 0
  },
  "dueDateReminders": {
    "sent": 12,
    "failed": 1
  },
  "message": "Successfully processed all reminders: 17 sent, 1 failed"
}
```

### Database Logging
- Smart nudges: Logged in existing system
- Due date reminders: Logged in `invoice_reminder_logs` table
- Invoice updates: `reminder_count` and `last_reminder_at` fields

## Testing

### Manual Testing
```bash
# Test the endpoint manually
curl -X POST "http://localhost:3000/api/process-all-reminders" \
  -H "Authorization: Bearer your-cron-secret" \
  -H "Content-Type: application/json"
```

### Development Mode
Set `NODE_ENV=development` to enable additional logging.

## Troubleshooting

### Common Issues
1. **401 Unauthorized**: Check `CRON_SECRET` environment variable
2. **No reminders sent**: Verify invoices have due dates and client emails
3. **Email failures**: Check `RESEND_API_KEY` and email service status
4. **Database errors**: Ensure migration has been run to add reminder fields

### Database Migration Required
Before using the system, run the migration:
```sql
-- See add_invoice_reminder_fields.sql for complete migration
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP WITH TIME ZONE;
```

## Manual Reminder Usage

Users can also trigger reminders manually through the LLM agent:
- "Send a reminder for invoice INV-123"
- "Send a due date reminder for invoice INV-456"
- "Remind client about overdue payment"

The system will automatically detect the intent and use the appropriate reminder service.