# Smart Nudge & Monthly Reports Cron Job Setup

This document describes the setup for automated cron jobs in the Hedwig WhatsApp bot system, including smart nudges for unpaid payment links and monthly earnings reports.

## Overview

The system includes two main automated features:
1. **Smart Nudges**: Automatically sends follow-up reminders for unpaid payment links
2. **Monthly Earnings Reports**: Sends comprehensive earnings summaries to users who have opted in

## Smart Nudges

### API Endpoint
The nudge processing is handled by the `/api/process-nudges` endpoint:
- **URL**: `POST /api/process-nudges`
- **Authentication**: Requires `CRON_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` in Authorization header
- **Response**: Returns count of sent and failed nudges

### Cron Job Configuration

#### Option 1: Using cron (Linux/macOS)

Add this line to your crontab (`crontab -e`):

```bash
# Run every 6 hours (at 00:00, 06:00, 12:00, 18:00)
0 */6 * * * curl -X POST "https://your-domain.com/api/process-nudges" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

#### Option 2: Using GitHub Actions

Create `.github/workflows/nudge-cron.yml`:

```yaml
name: Smart Nudge Processor
on:
  schedule:
    # Run every 6 hours
    - cron: '0 */6 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  process-nudges:
    runs-on: ubuntu-latest
    steps:
      - name: Process Nudges
        run: |
          curl -X POST "${{ secrets.APP_URL }}/api/process-nudges" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

#### Option 3: Using Vercel Cron Jobs

If deployed on Vercel, add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/process-nudges",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/monthly-reports",
      "schedule": "0 9 1 * *"
    }
  ]
}
```

#### Option 4: Using External Cron Services

Services like:
- **EasyCron**: https://www.easycron.com/
- **Cron-job.org**: https://cron-job.org/
- **UptimeRobot**: Monitor + webhook functionality

Configure them to make POST requests to your endpoints:
- `/api/process-nudges` every 6 hours
- `/api/cron/monthly-reports` on the 1st of every month

## Monthly Earnings Reports

### API Endpoint
- **URL**: `https://your-domain.com/api/cron/monthly-reports`
- **Method**: POST
- **Authentication**: Bearer token (optional, set via `CRON_SECRET` environment variable)

### Cron Job Configuration

#### Using cPanel/Hosting Provider
```bash
# Run on the 1st of every month at 9:00 AM
0 9 1 * * curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/cron/monthly-reports
```

#### Using GitHub Actions
Create `.github/workflows/monthly-reports.yml`:

```yaml
name: Monthly Reports
on:
  schedule:
    - cron: '0 9 1 * *'  # 1st of every month at 9:00 AM UTC
jobs:
  monthly-reports:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Monthly Reports
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-domain.com/api/cron/monthly-reports
```

## Environment Variables

Make sure these environment variables are set:

```env
# Required for cron authentication
CRON_SECRET=your-secure-random-string

# Required for Supabase operations
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Required for WhatsApp messaging
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# Optional: CoinGecko API for fiat conversions
COINGECKO_API_KEY=your-coingecko-api-key
```

## Testing

### Smart Nudges
To test the nudge processing manually:

```bash
curl -X POST "http://localhost:3000/api/process-nudges" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Monthly Reports
```bash
# Test the monthly reports endpoint
curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/cron/monthly-reports

# Or test via browser (GET request)
https://your-domain.com/api/cron/monthly-reports?test=true
```

## Monitoring

### Smart Nudges
The API endpoint returns useful information for monitoring:

```json
{
  "success": true,
  "processed": 5,
  "sent": 4,
  "failed": 1,
  "message": "Processed 5 nudges: 4 sent, 1 failed"
}
```

Consider setting up alerts if the `failed` count is consistently high.

### Monthly Reports
- Check application logs for report generation and delivery
- Monitor user preferences in the `user_preferences` table
- Track report delivery success rates

## Smart Nudge Logic

- **Trigger**: 24 hours after `viewed_at` timestamp
- **Frequency**: Every 6 hours (configurable in SmartNudgeService)
- **Limit**: Maximum 3 nudges per payment link
- **Stop Conditions**: 
  - Payment completed (`paid_at` is set)
  - Nudges disabled (`nudge_disabled` is true)
  - Maximum nudge count reached

## Monthly Reports Logic

- **Frequency**: Runs on the 1st of every month
- **Targeting**: Only users who have enabled monthly reports
- **Content**: Comprehensive earnings summary with insights and fiat conversions
- **Personalization**: Includes congratulatory messages and growth comparisons

## User Commands

### Monthly Reports Management
Users can control their monthly reports via WhatsApp:

```
# Enable monthly reports
"enable monthly reports"
"turn on monthly reports"

# Disable monthly reports  
"disable monthly reports"
"turn off monthly reports"

# Check status
"monthly status"
"report status"

# Preview what monthly report looks like
"preview monthly summary"
"show monthly summary"

# Set currency preference
"set currency USD"
"currency EUR"

# Set category preferences
"categories freelance airdrop staking"
```

## Troubleshooting

### Smart Nudges
1. **No nudges being sent**: Check if payment links have `viewed_at` timestamp
2. **Authentication errors**: Verify `CRON_SECRET` is correct
3. **WhatsApp errors**: Check `WHATSAPP_ACCESS_TOKEN` and phone number ID
4. **Database errors**: Verify Supabase connection and permissions

### Monthly Reports
1. **No reports being sent**: Check if users have enabled monthly reports
2. **Missing earnings data**: Verify payment links are being tracked properly
3. **Fiat conversion issues**: Check CoinGecko API key and rate limits
4. **User phone number lookup**: Implement phone number mapping in `getUserPhoneNumber()`

## Security Notes

- Keep `CRON_SECRET` secure and rotate it regularly
- Use HTTPS for all cron job requests
- Monitor the endpoint for unusual activity
- Consider rate limiting if needed
- Regularly rotate API keys and secrets