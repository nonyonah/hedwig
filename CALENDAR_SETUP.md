# Google Calendar Integration Setup

This guide will help you set up Google Calendar integration for automatic invoice due date tracking.

## Prerequisites

- Google Cloud Console account
- Access to your application's environment variables
- Database access for running migrations

## Step 1: Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

## Step 2: Create OAuth2 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen if prompted
4. Set application type to "Web application"
5. Add authorized redirect URIs:
   - For development: `http://localhost:3000/api/calendar/oauth/callback`
   - For production: `https://your-domain.com/api/calendar/oauth/callback`
6. Save and copy the Client ID and Client Secret

## Step 3: Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.calendar.example .env.local
   ```

2. Update your `.env.local` file with your Google OAuth2 credentials:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   GOOGLE_REDIRECT_URI=https://your-domain.com/api/calendar/oauth/callback
   CALENDAR_SYNC_ENABLED=true
   ```

## Step 4: Database Setup

Run the database migrations to create the necessary tables:

```sql
-- Create Google Calendar credentials table
\i create_google_calendar_credentials_table.sql

-- Add calendar event ID column to invoices table
\i add_calendar_event_id_to_invoices.sql
```

Or run them individually:

```bash
# Using psql
psql -d your_database -f create_google_calendar_credentials_table.sql
psql -d your_database -f add_calendar_event_id_to_invoices.sql

# Using Supabase CLI
supabase db push
```

## Step 5: Verify Installation

1. Start your application
2. Use the Telegram bot command `/calendar_status` to check if the feature is available
3. Try connecting a calendar with `/connect_calendar`
4. Create a test invoice to verify calendar event creation

## Features

Once set up, the calendar integration provides:

- **Automatic Event Creation**: Invoice due dates are automatically added to Google Calendar
- **Payment Updates**: Calendar events are updated when invoices are paid
- **Smart Reminders**: Email and popup reminders are set for due dates
- **Clean Deletion**: Calendar events are removed when invoices are deleted
- **Error Recovery**: Robust error handling with user-friendly messages

## Telegram Bot Commands

- `/connect_calendar` - Connect your Google Calendar
- `/disconnect_calendar` - Disconnect your Google Calendar
- `/calendar_status` - Check calendar connection status

## Troubleshooting

### Common Issues

1. **"Calendar not connected" error**
   - Verify your Google OAuth2 credentials
   - Check that the redirect URI matches exactly
   - Ensure the Google Calendar API is enabled

2. **"Permission denied" error**
   - Make sure users grant full calendar permissions during OAuth flow
   - Check Google Cloud Console for any API restrictions

3. **"Token expired" error**
   - This is normal - users just need to reconnect with `/connect_calendar`
   - The refresh token mechanism handles most cases automatically

4. **Database errors**
   - Ensure all migrations have been run
   - Check that the database user has proper permissions

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=calendar:*
```

### Support

For additional support:
1. Check the application logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test the OAuth flow manually using the `/connect_calendar` command

## Security Considerations

- Store client secrets securely and never commit them to version control
- Use HTTPS for all redirect URIs in production
- Regularly rotate OAuth2 credentials
- Monitor API usage in Google Cloud Console
- Implement rate limiting if needed

## API Endpoints

The integration creates these API endpoints:

- `POST /api/calendar/oauth/authorize` - Generate OAuth2 authorization URL
- `GET /api/calendar/oauth/callback` - Handle OAuth2 callback
- `GET /api/calendar/status` - Check calendar connection status

## Database Schema

### google_calendar_credentials
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key to users table)
- `access_token` (TEXT, encrypted)
- `refresh_token` (TEXT, encrypted)
- `calendar_id` (TEXT, defaults to 'primary')
- `connected_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### invoices (updated)
- `calendar_event_id` (TEXT, nullable) - Google Calendar event ID

## Performance

The integration includes several performance optimizations:

- **Credential Caching**: Reduces database queries for frequently accessed credentials
- **Retry Logic**: Exponential backoff for transient errors
- **Timeout Handling**: Prevents hanging requests
- **Batch Operations**: Efficient handling of multiple calendar operations

## Monitoring

Track these metrics for monitoring:

- Calendar connection success rate
- Event creation success rate
- Token refresh frequency
- API error rates
- User adoption metrics

The integration automatically tracks these events in PostHog:
- `calendar_connected`
- `calendar_disconnected`
- `calendar_event_created`
- `calendar_event_updated`
- `calendar_event_deleted`