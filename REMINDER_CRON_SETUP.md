# Automated Reminder System Setup

This document explains how to set up automated reminders for invoices and payment links with due dates.

## Overview

The system now supports automatic reminders that are sent:
- **3 days before** the due date
- **On the due date**
- **3 days after** the due date (overdue reminder)

## API Endpoints

### 1. Process All Reminders
```
POST /api/process-all-reminders
```
Processes both invoice and payment link reminders, plus smart nudges.

### 2. Process Invoice Reminders Only
```
POST /api/process-due-date-reminders
```
Processes only invoice due date reminders.

### 3. Process Payment Link Reminders Only
```
POST /api/process-payment-link-reminders
```
Processes only payment link due date reminders.

## Cron Job Setup

### Option 1: Vercel Cron Jobs (Recommended for Vercel deployments)

Add to your `vercel.json`:
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

### Option 2: GitHub Actions (For any deployment)

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
            -H "Content-Type: application/json"
```

### Option 3: External Cron Service

Use services like:
- **Cron-job.org**
- **EasyCron**
- **Zapier** (with webhook)

Set up a daily HTTP POST request to:
```
https://your-app-domain.com/api/process-all-reminders
```

### Option 4: Server Cron (Linux/Unix)

Add to crontab (`crontab -e`):
```bash
# Process reminders daily at 9 AM
0 9 * * * curl -X POST "https://your-app-domain.com/api/process-all-reminders"
```

## Database Schema Updates

### Payment Links Table
The following fields have been added:
- `due_date` (timestamp) - When payment is due
- `reminder_count` (integer) - Number of reminders sent
- `last_reminder_at` (timestamp) - Last reminder timestamp

### Payment Link Reminder Logs Table
New table `payment_link_reminder_logs` tracks:
- Reminder history
- Success/failure status
- Reminder types (before_due, on_due, overdue)

## Testing

Test the endpoints manually:

```bash
# Test all reminders
curl -X POST "http://localhost:3000/api/process-all-reminders"

# Test payment link reminders only
curl -X POST "http://localhost:3000/api/process-payment-link-reminders"

# Test invoice reminders only
curl -X POST "http://localhost:3000/api/process-due-date-reminders"
```

## Monitoring

### Logs
All reminder processing is logged with:
- Number of reminders sent
- Number of failures
- Detailed error messages

### Database Tracking
Reminder logs are stored in:
- `invoice_reminder_logs`
- `payment_link_reminder_logs`

### Response Format
```json
{
  "success": true,
  "nudges": { "sent": 5, "failed": 0 },
  "invoiceDueDateReminders": { "sent": 3, "failed": 0 },
  "paymentLinkDueDateReminders": { "sent": 2, "failed": 0 },
  "message": "Successfully processed all reminders: 10 sent, 0 failed"
}
```

## Security

- Endpoints are protected by server-side validation
- No authentication required for cron endpoints (they're internal)
- Rate limiting should be implemented if exposing publicly

## Troubleshooting

### Common Issues

1. **No reminders being sent**
   - Check if payment links/invoices have `due_date` set
   - Verify email service configuration
   - Check database connectivity

2. **Cron job not running**
   - Verify cron service is active
   - Check endpoint URL is correct
   - Ensure app is deployed and accessible

3. **Email delivery failures**
   - Check RESEND_API_KEY configuration
   - Verify sender email domain
   - Check recipient email validity

### Debug Mode

Enable detailed logging by setting:
```env
NODE_ENV=development
```

## Next Steps

1. **Deploy the database migration** (`add_payment_link_due_date_fields.sql`)
2. **Choose and configure** your preferred cron solution
3. **Test the complete flow** with sample data
4. **Monitor logs** for the first few days
5. **Update UI** to allow setting due dates when creating payment links

## Manual Reminder Commands

Users can also send manual reminders via Telegram:
- "Send reminder for payment link [ID]"
- "Remind [client@email.com]"
- "Send due date reminder for invoice [ID]"