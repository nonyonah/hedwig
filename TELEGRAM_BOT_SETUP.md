# Telegram Bot Setup Guide

This guide will help you set up the Hedwig AI Assistant as a Telegram bot using the official Telegram Bot API.

## Prerequisites

- A Telegram account
- Access to @BotFather on Telegram
- Your Hedwig application deployed and accessible via HTTPS

## Step 1: Create Your Telegram Bot

1. **Start a chat with @BotFather** on Telegram
2. **Send the command** `/newbot`
3. **Choose a name** for your bot (e.g., "Hedwig AI Assistant")
4. **Choose a username** for your bot (must end with 'bot', e.g., "hedwig_ai_bot")
5. **Save your bot token** - BotFather will provide you with a token that looks like:
   ```
   4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc
   ```

## Step 2: Configure Environment Variables

Add your bot token to your environment variables:

```bash
# In your .env file
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

## Step 3: Set Up Webhook

1. **Navigate to the Telegram setup page** in your Hedwig application: `/telegram`
2. **Configure the webhook URL** to: `https://yourdomain.com/api/telegram/webhook`
3. **Click "Configure Webhook"** to register your webhook with Telegram

## Step 4: Test Your Bot

1. **Find your bot** on Telegram using the username you created
2. **Send `/start`** to begin interacting with your bot
3. **Try sending messages** like:
   - "Create an invoice for $500"
   - "Show me my earnings summary"
   - "Help me with a payment reminder"

## Available Commands

Your Telegram bot supports the following commands:

- `/start` - Initialize the bot and show welcome message
- `/help` - Display help information and available features
- `/about` - Learn more about Hedwig AI Assistant

## Features

The Telegram bot integrates with all Hedwig features:

- **Invoice Creation** - Generate professional invoices
- **Payment Tracking** - Monitor payment status and history
- **Earnings Analytics** - View earnings summaries and reports
- **Payment Reminders** - Send automated payment reminders
- **Token Swaps** - Assistance with cryptocurrency transactions
- **General AI Assistant** - Natural language processing for business queries

## Security Considerations

- **Keep your bot token secure** - Never share it publicly
- **Use HTTPS** - Telegram requires HTTPS for webhooks
- **Validate incoming requests** - The webhook endpoint validates Telegram updates
- **Rate limiting** - Consider implementing rate limiting for production use

## Troubleshooting

### Bot not responding
1. Check that your bot token is correctly set in environment variables
2. Verify your webhook URL is accessible via HTTPS
3. Check the application logs for any errors

### Webhook setup fails
1. Ensure your domain supports HTTPS
2. Verify the webhook URL format: `https://yourdomain.com/api/telegram/webhook`
3. Check that your server is accessible from the internet

### Commands not working
1. Make sure the bot is properly configured with @BotFather
2. Verify that your application is running and accessible
3. Check the webhook endpoint is receiving updates

## API Endpoints

The Telegram integration provides these API endpoints:

- `GET /api/telegram/setup` - Check bot configuration status
- `POST /api/telegram/setup` - Configure webhook and bot settings
- `POST /api/telegram/webhook` - Receive updates from Telegram

## Development

For local development:

1. **Use ngrok** or similar tool to expose your local server via HTTPS
2. **Set the webhook URL** to your ngrok URL + `/api/telegram/webhook`
3. **Test locally** by sending messages to your bot

Example with ngrok:
```bash
ngrok http 3000
# Use the HTTPS URL provided by ngrok for your webhook
```

## Production Deployment

1. **Deploy your application** to a server with HTTPS support
2. **Set environment variables** including `TELEGRAM_BOT_TOKEN`
3. **Configure the webhook** using your production domain
4. **Monitor logs** to ensure proper operation

## Support

For issues with the Telegram bot integration:

1. Check the application logs for error messages
2. Verify your bot token and webhook configuration
3. Test the webhook endpoint directly
4. Consult the [Telegram Bot API documentation](https://core.telegram.org/bots/api)

## References

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [BotFather Commands](https://core.telegram.org/bots#6-botfather)
- [Webhook Guide](https://core.telegram.org/bots/webhooks)