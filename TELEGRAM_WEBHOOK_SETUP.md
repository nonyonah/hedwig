# Telegram Bot Webhook Setup Guide

This guide will help you set up the Telegram webhook for your bot to receive messages properly.

## Prerequisites

1. **Telegram Bot Token**: Get this from [@BotFather](https://t.me/BotFather) on Telegram
2. **Public URL**: Your app must be deployed and accessible via HTTPS
3. **Environment Variables**: Properly configured environment variables

## Quick Setup

### 1. Configure Environment Variables

Create a `.env` file (or update your existing one) with:

```bash
# Required for Telegram bot
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
NEXT_PUBLIC_APP_URL=https://your-deployed-app.com

# Other required variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 2. Deploy Your App

Make sure your app is deployed and accessible via HTTPS. The webhook URL will be:
```
https://your-deployed-app.com/api/telegram/webhook
```

### 3. Set Up the Webhook

#### Option A: Using the Setup Script (Recommended)

Run the automated setup script:

```bash
node scripts/setup-telegram-webhook.js
```

This script will:
- Validate your environment variables
- Get your bot information
- Set the webhook URL
- Verify the webhook is working

#### Option B: Using the API Endpoints

1. **Check bot status**:
   ```bash
   curl https://your-app.com/api/telegram/setup
   ```

2. **Set the webhook**:
   ```bash
   curl -X POST https://your-app.com/api/telegram/setup \
     -H "Content-Type: application/json" \
     -d '{"action": "setWebhook"}'
   ```

3. **Get webhook info**:
   ```bash
   curl -X POST https://your-app.com/api/telegram/setup \
     -H "Content-Type: application/json" \
     -d '{"action": "getWebhookInfo"}'
   ```

#### Option C: Manual Setup via Telegram API

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/api/telegram/webhook",
    "drop_pending_updates": true,
    "allowed_updates": ["message", "callback_query", "inline_query"]
  }'
```

## Verification

### 1. Check Webhook Status

Visit: `https://your-app.com/api/telegram/webhook`

You should see a response like:
```json
{
  "status": "active",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "2.0.0 (node-telegram-bot-api)",
  "botConfigured": true,
  "webhookUrl": "https://your-app.com/api/telegram/webhook"
}
```

### 2. Check Setup Status

Visit: `https://your-app.com/api/telegram/setup`

You should see:
```json
{
  "configured": true,
  "botInfo": {
    "id": 123456789,
    "is_bot": true,
    "first_name": "Your Bot Name",
    "username": "your_bot_username"
  },
  "webhookInfo": {
    "url": "https://your-app.com/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  },
  "expectedWebhookUrl": "https://your-app.com/api/telegram/webhook",
  "webhookSet": true
}
```

### 3. Test the Bot

1. Send a message to your bot on Telegram
2. Check your app logs for webhook activity
3. The bot should respond according to its programmed behavior

## Troubleshooting

### Common Issues

1. **"Bot token not configured"**
   - Make sure `TELEGRAM_BOT_TOKEN` is set in your environment variables
   - Verify the token is correct (get a new one from @BotFather if needed)

2. **"Base URL not configured"**
   - Set `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_BASE_URL` in your environment
   - Make sure the URL is your deployed app's HTTPS URL

3. **"Webhook not receiving messages"**
   - Verify your app is deployed and accessible via HTTPS
   - Check that the webhook URL returns a 200 status
   - Ensure no firewall is blocking Telegram's servers

4. **"SSL certificate verify failed"**
   - Make sure your HTTPS certificate is valid
   - Telegram requires a valid SSL certificate for webhooks

### Debug Steps

1. **Check environment variables**:
   ```bash
   node -e "console.log('Bot Token:', !!process.env.TELEGRAM_BOT_TOKEN); console.log('App URL:', process.env.NEXT_PUBLIC_APP_URL);"
   ```

2. **Test webhook endpoint manually**:
   ```bash
   curl -X POST https://your-app.com/api/telegram/webhook \
     -H "Content-Type: application/json" \
     -d '{"update_id": 1, "message": {"message_id": 1, "date": 1640995200, "chat": {"id": 123, "type": "private"}, "from": {"id": 123, "is_bot": false, "first_name": "Test"}, "text": "test"}}'
   ```

3. **Check Telegram webhook info**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
   ```

### Webhook Requirements

- **HTTPS**: Telegram only sends webhooks to HTTPS URLs
- **Valid SSL**: Certificate must be valid and trusted
- **Port**: Use standard HTTPS port (443) or ports 80, 88, 443, 8443
- **Response**: Webhook must respond with HTTP 200 within 60 seconds
- **Content**: Response body should be JSON with `{"ok": true}`

## API Endpoints

### Webhook Endpoint
- **URL**: `/api/telegram/webhook`
- **Methods**: `GET`, `POST`
- **Purpose**: Receives updates from Telegram

### Setup Endpoint
- **URL**: `/api/telegram/setup`
- **Methods**: `GET`, `POST`
- **Purpose**: Configure and manage webhook settings

### Available Actions (POST to `/api/telegram/setup`)

```json
{"action": "setWebhook"}      // Set the webhook URL
{"action": "deleteWebhook"}   // Remove the webhook
{"action": "getWebhookInfo"}  // Get current webhook status
{"action": "getBotInfo"}      // Get bot information
```

## Security Notes

- Keep your bot token secret and never commit it to version control
- Use environment variables for all sensitive configuration
- Regularly rotate your bot token if compromised
- Monitor webhook logs for suspicious activity

## Next Steps

After setting up the webhook:

1. Test all bot commands and features
2. Monitor logs for any errors
3. Set up monitoring/alerting for webhook failures
4. Consider implementing rate limiting if needed

For more information, see:
- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [Telegram Webhooks Guide](https://core.telegram.org/bots/webhooks)