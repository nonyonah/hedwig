# CDP Webhook Setup Guide

This guide explains how to set up Coinbase Developer Platform (CDP) webhooks to automatically detect and notify users of direct USDC transfers to their wallets.

## Overview

The CDP webhook integration allows Hedwig to:
- Automatically detect USDC transfers to user wallets on Base network
- Send real-time Telegram and email notifications
- Track direct transfers without manual intervention
- Provide transaction details and links to BaseScan

## Prerequisites

1. **CDP API Credentials**: You need a Coinbase Developer Platform account with API access
2. **Environment Variables**: Required CDP configuration in your `.env` file
3. **Public Webhook Endpoint**: Your application must be accessible via HTTPS

## Environment Variables

Add these variables to your `.env` file:

```bash
# CDP API Configuration
CDP_API_KEY_NAME=your_cdp_api_key_name
CDP_PRIVATE_KEY=your_cdp_private_key
CDP_WEBHOOK_SECRET=your_webhook_secret_for_signature_verification

# Application URL (must be HTTPS for production)
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

## Setup Steps

### 1. Install Dependencies

The CDP SDK is already included in the project dependencies:
```bash
npm install  # This will install @coinbase/cdp-sdk
```

### 2. Create CDP Webhook

Use the setup script to create a webhook:

```bash
# Create a new webhook
node scripts/setup-cdp-webhook.js create

# List existing webhooks
node scripts/setup-cdp-webhook.js list

# Delete a webhook (if needed)
node scripts/setup-cdp-webhook.js delete <webhook-id>
```

### 3. Webhook Configuration

The webhook is configured to:
- **Network**: Base Mainnet (`base-mainnet`)
- **Event Type**: ERC20 transfers (`erc20_transfer`)
- **Asset**: USDC only (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **Endpoint**: `https://your-domain.com/api/webhooks/alchemy` (migrated from CDP to Alchemy)

## How It Works

### 1. Webhook Reception
- Alchemy sends POST requests to `/api/webhooks/alchemy` when USDC transfers occur (migrated from CDP)
- Webhook signature is verified using `CDP_WEBHOOK_SECRET`
- Only USDC transfers on Base network are processed

### 2. Payment Identification
- The system identifies the type of payment:
  - **Direct Transfer**: General USDC transfer to a user's wallet
  - **Invoice Payment**: Transfer matching an outstanding invoice (by wallet, amount, and status)
  - **Payment Link Payment**: Transfer matching a pending payment link (by wallet, amount, token, and status)

### 3. Database Updates
- For invoices and payment links, the system automatically updates the status to 'paid' and records payment details
- Sender wallet addresses are tracked for invoice and payment link payments

### 4. User Identification
- System looks up the recipient wallet address in the `wallets` table
- If a user is found, notifications are triggered
- If no user is found, the event is logged but no notification is sent

### 5. Notification Flow
- Webhook calls `/api/webhooks/payment-notifications` with appropriate type and context
- Telegram notification sent with transaction details and BaseScan links
- Email notification sent with formatted transfer information

## API Endpoint Examples

### CDP Webhook Endpoint
```
POST /api/webhooks/alchemy
Content-Type: application/json
X-CC-Webhook-Signature: <signature>

{
  "event_type": "erc20_transfer",
  "event_type_version": "1.0",
  "event_id": "unique-event-id",
  "event_time": "2024-01-15T10:30:00Z",
  "api_version": "2024-02-15",
  "data": {
    "network": "base-mainnet",
    "block_height": 123456,
    "block_hash": "0x...",
    "block_timestamp": "2024-01-15T10:30:00Z",
    "transaction_hash": "0x...",
    "transaction_index": 0,
    "log_index": 0,
    "from_address": "0x...",
    "to_address": "0x...",
    "contract_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "value": "1000000",
    "asset": {
      "asset_id": "usdc",
      "decimals": 6
    }
  }
}
```

### Payment Notification Webhook

#### Direct Transfer
```
POST /api/webhooks/payment-notifications
Content-Type: application/json

{
  "type": "direct_transfer",
  "id": "unique-event-id",
  "amount": "1.00",
  "currency": "USDC",
  "transactionHash": "0x...",
  "payerWallet": "0x...",
  "recipientWallet": "0x...",
  "status": "completed",
  "chain": "base-mainnet",
  "senderAddress": "0x...",
  "recipientUserId": "user-uuid"
}
```

#### Invoice Payment
```
POST /api/webhooks/payment-notifications
Content-Type: application/json

{
  "type": "invoice",
  "id": "invoice-uuid",
  "amount": "500.00",
  "currency": "USDC",
  "transactionHash": "0x...",
  "payerWallet": "0x...",
  "recipientWallet": "0x...",
  "status": "completed",
  "chain": "base-mainnet",
  "senderAddress": "0x...",
  "recipientUserId": "user-uuid",
  "freelancerName": "John Doe",
  "clientName": "Acme Corp"
}
```

#### Payment Link Payment
```
POST /api/webhooks/payment-notifications
Content-Type: application/json

{
  "type": "payment_link",
  "id": "payment-link-uuid",
  "amount": "25.00",
  "currency": "USDC",
  "transactionHash": "0x...",
  "payerWallet": "0x...",
  "recipientWallet": "0x...",
  "status": "completed",
  "chain": "base-mainnet",
  "senderAddress": "0x...",
  "recipientUserId": "user-uuid",
  "userName": "Jane Smith",
  "paymentReason": "Coffee payment"
}
```

## Notification Templates

### Telegram Notification
- **Direct Transfer**: Shows amount, sender wallet address, recipient wallet, chain, and transaction hash
- **Invoice Payment**: Shows invoice details, amount, client name, sender wallet address, chain, and transaction hash
- **Payment Link Payment**: Shows payment reason, amount, payer name, sender wallet address, chain, and transaction hash
- **Features**: All notifications include BaseScan links for transaction verification

```
💸 Direct Transfer Received!

💰 Amount: 1.0 USDC
👤 From: `0x1234...5678`
📱 To: `0xabcd...efgh`
⛓️ Chain: base-mainnet
🔗 Transaction: `0x9876...5432`
⏰ Time: Jan 1, 2024, 12:00:00 PM

[🔍 View on BaseScan] [💰 Check Balance]
```

### Email Notification
- **Subject**: "🎉 Payment Received - [Type] [Identifier]"
- **Content**: Formatted HTML email with comprehensive payment details including:
  - Payment type and identifier
  - Amount and currency
  - Sender wallet address (when available)
  - Blockchain network (chain)
  - Transaction hash with code formatting
  - Client/payer information (context-dependent)
- **Styling**: Professional design with gradient header and structured payment information
- **BaseScan Integration**: Transaction verification links

## Security Features

1. **Signature Verification**: All webhooks are verified using HMAC-SHA256
2. **HTTPS Only**: Webhooks only work with HTTPS endpoints
3. **Asset Filtering**: Only USDC transfers are processed
4. **User Validation**: Only registered users receive notifications

## Monitoring and Debugging

### Logs
Webhook events are logged with:
- Transaction details
- User identification results
- Notification success/failure

### Testing
```bash
# Test webhook endpoint locally (requires ngrok or similar)
curl -X POST https://your-domain.com/api/webhooks/alchemy \
  -H "Content-Type: application/json" \
  -H "x-cc-webhook-signature: your-test-signature" \
  -d '{"test": "payload"}'
```

### Common Issues

1. **Invalid Signature**: Check `CDP_WEBHOOK_SECRET` configuration
2. **User Not Found**: Ensure wallet addresses are properly stored in database
3. **Network Issues**: Verify webhook URL is accessible via HTTPS
4. **Rate Limiting**: CDP may rate limit webhook deliveries

## Production Considerations

1. **Webhook Reliability**: CDP will retry failed webhooks with exponential backoff
2. **Idempotency**: Handle duplicate webhook deliveries gracefully
3. **Monitoring**: Set up alerts for webhook failures
4. **Scaling**: Consider webhook processing queues for high volume

## Support

For CDP-specific issues:
- [Coinbase Developer Platform Documentation](https://docs.cdp.coinbase.com/webhooks/)
- [CDP SDK Documentation](https://github.com/coinbase/coinbase-sdk-nodejs)

For Hedwig integration issues:
- Check application logs
- Verify environment variables
- Test webhook endpoint accessibility