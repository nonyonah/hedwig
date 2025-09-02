# PostHog Analytics Integration Guide

This guide shows how to integrate the comprehensive PostHog analytics tracking throughout the Hedwig Telegram bot.

## Overview

The analytics system tracks:
- **Bot Lifecycle**: User starts/stops, registrations
- **Commands**: Usage, completion, success/failure
- **Messages**: Types, content analysis, engagement
- **User Engagement**: Sessions, activity patterns, retention
- **Feature Usage**: Transactions, invoices, proposals, wallet operations
- **Errors**: Application errors, API failures, validation issues
- **Business Metrics**: Revenue events, conversions

## Quick Start

### 1. Import Analytics Utilities

```typescript
import { AnalyticsMiddleware, TransactionAnalytics, FeatureAnalytics } from '../lib/analytics';
import { HedwigEvents } from '../lib/posthog';
```

### 2. Basic Message Tracking

Add to your message handler:

```typescript
// In webhook.ts or telegramBot.ts message handler
bot.on('message', async (msg) => {
  const userId = await getUserIdFromMessage(msg);
  
  // Track the message
  await AnalyticsMiddleware.trackMessage(msg, userId);
  
  // Your existing message handling logic...
});
```

### 3. Command Tracking

Add to command handlers:

```typescript
// Example: /start command
case '/start':
  try {
    await AnalyticsMiddleware.trackCommand(msg, userId, '/start');
    
    // Check if new user
    const isNewUser = await checkIfNewUser(userId);
    await AnalyticsMiddleware.trackBotStart(userId, msg.from!, isNewUser);
    
    // Your existing start logic...
    
    await AnalyticsMiddleware.trackCommandCompletion(userId, '/start', 'success');
  } catch (error) {
    await AnalyticsMiddleware.trackError(userId, error, 'start_command');
    await AnalyticsMiddleware.trackCommandCompletion(userId, '/start', 'error');
  }
  break;
```

## Detailed Integration Examples

### Bot Lifecycle Events

#### User Registration (in ensureUserExists function)

```typescript
// In webhook.ts ensureUserExists function
async function ensureUserExists(from: TelegramBot.User, chatId: number): Promise<void> {
  const userId = await getUserId(chatId);
  
  if (!userId) {
    // New user registration
    const newUserId = await createUser(from, chatId);
    
    await HedwigEvents.userRegistered(newUserId, {
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      languageCode: from.language_code
    });
  }
}
```

#### Bot Start/Stop

```typescript
// Track bot start
case '/start':
  await AnalyticsMiddleware.trackBotStart(userId, msg.from!, isNewUser);
  break;

// Track bot stop (when user blocks bot)
bot.on('my_chat_member', async (update) => {
  if (update.new_chat_member.status === 'kicked') {
    const userId = await getUserIdFromChatId(update.chat.id);
    await HedwigEvents.botStopped(userId, 'blocked_by_user');
  }
});
```

### Command Tracking

#### Comprehensive Command Handler

```typescript
async function handleCommand(msg: TelegramBot.Message) {
  const userId = await getUserIdFromMessage(msg);
  const command = msg.text?.split(' ')[0] || '';
  
  // Track command usage
  await AnalyticsMiddleware.trackCommand(msg, userId, command);
  
  try {
    switch (command) {
      case '/balance':
        const balance = await getWalletBalance(userId);
        await HedwigEvents.walletBalanceChecked(userId);
        await AnalyticsMiddleware.trackCommandCompletion(userId, command, 'success', {
          balance_found: balance > 0
        });
        break;
        
      case '/send':
        await FeatureAnalytics.trackFeature(userId, 'send', 'initiated');
        // Your send logic...
        break;
        
      case '/invoice':
        await FeatureAnalytics.trackFeature(userId, 'invoice', 'creation_started');
        // Your invoice logic...
        break;
    }
  } catch (error) {
    await AnalyticsMiddleware.trackError(userId, error, `command_${command}`);
    await AnalyticsMiddleware.trackCommandCompletion(userId, command, 'error');
  }
}
```

### Transaction Tracking

#### Send/Transfer Operations

```typescript
// In your send/transfer handler
async function handleSendTransaction(userId: string, amount: number, currency: string, recipient: string) {
  try {
    // Track transaction initiation
    await TransactionAnalytics.trackTransactionStart(userId, 'send', amount, currency, recipient);
    
    // Perform transaction
    const txResult = await performTransaction(amount, currency, recipient);
    
    // Track completion
    await TransactionAnalytics.trackTransactionComplete(
      userId, 
      'send', 
      amount, 
      currency, 
      txResult.success, 
      txResult.txHash
    );
    
    if (txResult.success) {
      await HedwigEvents.tokensSent(userId, {
        amount,
        currency,
        recipient,
        tx_hash: txResult.txHash
      });
    }
    
  } catch (error) {
    await AnalyticsMiddleware.trackError(userId, error, 'send_transaction');
    await TransactionAnalytics.trackTransactionComplete(userId, 'send', amount, currency, false);
  }
}
```

#### Invoice Creation

```typescript
// In invoice creation handler
async function createInvoice(userId: string, invoiceData: any) {
  try {
    await FeatureAnalytics.trackFeature(userId, 'invoice', 'creation_started');
    
    const invoice = await createInvoiceInDB(invoiceData);
    
    await HedwigEvents.invoiceCreated(
      userId, 
      invoice.id, 
      invoiceData.amount, 
      invoiceData.currency
    );
    
    await FeatureAnalytics.trackFeature(userId, 'invoice', 'creation_completed', {
      invoice_id: invoice.id,
      amount: invoiceData.amount
    });
    
  } catch (error) {
    await AnalyticsMiddleware.trackError(userId, error, 'invoice_creation');
  }
}
```

### Error Tracking

#### API Error Handling

```typescript
// In API call handlers
async function callExternalAPI(userId: string, endpoint: string) {
  try {
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      await AnalyticsMiddleware.trackApiError(
        userId,
        endpoint,
        'GET',
        response.status,
        response.statusText
      );
    }
    
    return response;
  } catch (error) {
    await AnalyticsMiddleware.trackError(userId, error, 'external_api_call', {
      endpoint
    });
    throw error;
  }
}
```

#### User Input Validation

```typescript
// In input validation
async function validateUserInput(userId: string, command: string, input: string) {
  if (!isValidAmount(input)) {
    await AnalyticsMiddleware.trackUserInputError(
      userId,
      command,
      'Valid amount (e.g., 10.5)',
      input,
      'Please enter a valid number'
    );
    return false;
  }
  return true;
}
```

### Engagement Tracking

#### Session Management

```typescript
// Start session on first message
bot.on('message', async (msg) => {
  const userId = await getUserIdFromMessage(msg);
  
  // Check if this is a new session
  if (!hasActiveSession(userId)) {
    await AnalyticsMiddleware.startUserSession(userId);
  }
  
  // Track message
  await AnalyticsMiddleware.trackMessage(msg, userId);
});

// End session on inactivity (run periodically)
setInterval(() => {
  AnalyticsMiddleware.cleanupInactiveSessions(30); // 30 minutes
}, 5 * 60 * 1000); // Check every 5 minutes
```

#### Activity Patterns

```typescript
// Track different activity types
bot.on('message', async (msg) => {
  const userId = await getUserIdFromMessage(msg);
  
  if (msg.text?.startsWith('/')) {
    await EngagementAnalytics.trackActivity(userId, 'command_usage');
  } else {
    await EngagementAnalytics.trackActivity(userId, 'message_sending');
  }
});

bot.on('callback_query', async (query) => {
  const userId = await getUserIdFromCallbackQuery(query);
  await EngagementAnalytics.trackActivity(userId, 'button_interaction');
});
```

### Offramp/Withdrawal Tracking

```typescript
// In offramp handler
async function handleOfframp(userId: string, amount: number, currency: string, method: string) {
  try {
    await HedwigEvents.offrampInitiated(userId, { amount, currency, method });
    
    const result = await processOfframp(amount, currency, method);
    
    await HedwigEvents.offrampCompleted(userId, {
      amount,
      currency,
      method,
      success: result.success
    });
    
  } catch (error) {
    await AnalyticsMiddleware.trackError(userId, error, 'offramp_process');
    await HedwigEvents.offrampCompleted(userId, {
      amount,
      currency,
      method,
      success: false
    });
  }
}
```

## Integration Checklist

### Core Bot Files to Update

- [ ] **`src/pages/api/webhook.ts`**
  - [ ] Add message tracking to message handler
  - [ ] Add command tracking to command handlers
  - [ ] Add session management
  - [ ] Add error tracking to try/catch blocks

- [ ] **`src/lib/telegramBot.ts`**
  - [ ] Add analytics imports
  - [ ] Track bot lifecycle events
  - [ ] Add session management

- [ ] **`src/modules/bot-integration.ts`**
  - [ ] Add feature usage tracking
  - [ ] Track user interactions

### Feature-Specific Files

- [ ] **Invoice Module**
  - [ ] Track invoice creation
  - [ ] Track invoice sending
  - [ ] Track invoice payments

- [ ] **Proposal Module**
  - [ ] Track proposal creation
  - [ ] Track proposal sending
  - [ ] Track proposal acceptance

- [ ] **Payment/Send Module**
  - [ ] Track transaction initiation
  - [ ] Track transaction completion
  - [ ] Track payment link creation

- [ ] **Wallet Module**
  - [ ] Track wallet operations
  - [ ] Track balance checks
  - [ ] Track wallet connections

- [ ] **Offramp Module**
  - [ ] Track withdrawal initiation
  - [ ] Track withdrawal completion

### API Endpoints to Update

- [ ] **Payment Webhooks**
  - [ ] Track payment confirmations
  - [ ] Track webhook processing

- [ ] **Transaction APIs**
  - [ ] Track API usage
  - [ ] Track API errors

## Testing the Integration

### 1. Test Basic Tracking

```bash
# Run the PostHog test script
node test-posthog.cjs
```

### 2. Test Bot Interactions

1. Start the bot: `/start`
2. Use various commands: `/balance`, `/send`, `/invoice`
3. Send different message types
4. Check PostHog dashboard for events

### 3. Verify Event Categories

In PostHog, you should see events categorized as:
- `bot_lifecycle`: bot_started, user_registered, bot_stopped
- `commands`: command_used, command_completed
- `messages`: message_received, text_message_analyzed
- `engagement`: session_started, session_ended, user_activity
- `features`: All feature-related events
- `errors`: error_occurred, api_error, validation_error
- `business`: revenue_event, conversion_event

## Best Practices

1. **Error Handling**: Always wrap analytics calls in try/catch
2. **Performance**: Analytics calls are async and non-blocking
3. **Privacy**: Don't track sensitive data (private keys, passwords)
4. **Data Quality**: Use consistent naming conventions
5. **Testing**: Test analytics in development before production

## Troubleshooting

### Common Issues

1. **Events not appearing**: Check PostHog API key and host configuration
2. **Missing user IDs**: Ensure user ID mapping is correct
3. **Duplicate events**: Check for multiple tracking calls
4. **Performance issues**: Ensure analytics calls don't block main logic

### Debug Mode

Enable debug mode in `.env.local`:

```env
POSTHOG_DEBUG=true
```

This will log all PostHog API calls and responses.

## Next Steps

1. Implement basic message and command tracking
2. Add feature-specific tracking
3. Set up error tracking
4. Configure PostHog dashboards
5. Set up alerts for critical events
6. Analyze user behavior patterns

For questions or issues, refer to the PostHog documentation or the troubleshooting guide in `POSTHOG_TROUBLESHOOTING.md`.