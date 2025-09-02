# PostHog User Identification Implementation Guide

This guide provides step-by-step instructions for implementing proper user identification in your Hedwig Telegram bot to ensure user profiles are created and events are properly associated with users.

## 🎯 Overview

The implementation includes:
- ✅ User profile creation with `$identify` events
- ✅ Automatic user identification for all events
- ✅ Telegram user property mapping
- ✅ Session management and tracking
- ✅ Error handling and debugging

## 📁 File Structure

```
src/
├── lib/
│   ├── posthog.ts              # Enhanced PostHog client
│   ├── userIdentification.ts   # User identification service
│   └── analytics.ts             # Analytics middleware
├── telegramBot.ts               # Main bot file (to be updated)
└── ...
```

## 🔧 Implementation Steps

### Step 1: Update Main Bot File

Update your `telegramBot.ts` to integrate user identification:

```typescript
// Add these imports at the top
import { UserIdentificationMiddleware, UserIdentificationService } from './lib/userIdentification';
import { AnalyticsMiddleware } from './lib/analytics';

// In your TelegramBotService class, add these properties:
private userIdentificationMiddleware: UserIdentificationMiddleware;
private analyticsMiddleware: AnalyticsMiddleware;

// In the constructor, initialize the middleware:
constructor() {
  // ... existing initialization ...
  
  this.userIdentificationMiddleware = new UserIdentificationMiddleware();
  this.analyticsMiddleware = new AnalyticsMiddleware();
  
  this.setupEventHandlers();
}

// Update your message handler:
private setupEventHandlers() {
  // Handle all messages
  this.bot.on('message', async (msg) => {
    try {
      // 1. Process user identification first
      await this.userIdentificationMiddleware.processMessage(msg);
      
      // 2. Track the message
      await this.analyticsMiddleware.trackMessage(msg);
      
      // 3. Handle your existing message logic
      await this.handleMessage(msg);
      
    } catch (error) {
      console.error('Error handling message:', error);
      await this.analyticsMiddleware.trackError(msg.from, 'message_handling_error', {
        error: error.message,
        message_id: msg.message_id
      });
    }
  });
  
  // Handle callback queries
  this.bot.on('callback_query', async (query) => {
    try {
      // 1. Process user identification
      await this.userIdentificationMiddleware.processCallbackQuery(query);
      
      // 2. Handle your existing callback logic
      await this.handleCallbackQuery(query);
      
    } catch (error) {
      console.error('Error handling callback query:', error);
      await this.analyticsMiddleware.trackError(query.from, 'callback_query_error', {
        error: error.message,
        callback_data: query.data
      });
    }
  });
  
  // Handle inline queries
  this.bot.on('inline_query', async (query) => {
    try {
      // 1. Process user identification
      await this.userIdentificationMiddleware.processInlineQuery(query);
      
      // 2. Handle your existing inline query logic
      await this.handleInlineQuery(query);
      
    } catch (error) {
      console.error('Error handling inline query:', error);
    }
  });
}

// Update your command handlers to include user tracking:
private async handleStartCommand(msg: TelegramBot.Message) {
  const user = msg.from;
  if (!user) return;
  
  try {
    // Track command usage
    await this.analyticsMiddleware.trackCommand(user, '/start', {
      chat_type: msg.chat.type,
      is_new_user: true // You can determine this based on your logic
    });
    
    // Track bot start for this user
    await this.analyticsMiddleware.trackBotStart(user, true);
    
    // Your existing start command logic
    await this.bot.sendMessage(msg.chat.id, 'Welcome to Hedwig!');
    
    // Track command completion
    await this.analyticsMiddleware.trackCommandCompletion(user, '/start', true);
    
  } catch (error) {
    console.error('Error in start command:', error);
    await this.analyticsMiddleware.trackError(user, 'command_error', {
      command: '/start',
      error: error.message
    });
  }
}

// Example for other commands:
private async handleOfframpCommand(msg: TelegramBot.Message) {
  const user = msg.from;
  if (!user) return;
  
  try {
    await this.analyticsMiddleware.trackCommand(user, '/offramp');
    
    // Your existing offramp logic
    const miniAppUrl = this.buildMiniAppUrl('/offramp', user.id);
    
    await this.bot.sendMessage(msg.chat.id, 'Opening offramp...', {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Open Offramp', web_app: { url: miniAppUrl } }
        ]]
      }
    });
    
    // Track feature usage
    await UserIdentificationService.trackEventWithIdentification(
      user,
      'offramp_opened',
      {
        category: 'features',
        feature: 'offramp',
        source: 'telegram_command'
      }
    );
    
    await this.analyticsMiddleware.trackCommandCompletion(user, '/offramp', true);
    
  } catch (error) {
    console.error('Error in offramp command:', error);
    await this.analyticsMiddleware.trackError(user, 'command_error', {
      command: '/offramp',
      error: error.message
    });
  }
}
```

### Step 2: Environment Configuration

Ensure your `.env.local` file has the correct PostHog configuration:

```env
# PostHog Configuration
POSTHOG_API_KEY=your_posthog_api_key_here
POSTHOG_HOST=https://us.i.posthog.com  # or https://eu.i.posthog.com for EU
POSTHOG_DEBUG=true  # Set to false in production

# Other environment variables...
```

### Step 3: Test the Implementation

1. **Run the test script:**
   ```bash
   node test-user-identification.cjs
   ```

2. **Check PostHog Dashboard:**
   - Go to PostHog → "Persons" tab
   - Look for test users created by the script
   - Verify user properties are populated

3. **Test with Real Bot:**
   ```bash
   npm run dev  # or your bot start command
   ```
   - Send `/start` command to your bot
   - Check PostHog for new user profiles

### Step 4: Verify User Profiles

In PostHog "Persons" tab, each user should have:

**Core Properties:**
- `platform`: "telegram"
- `bot_name`: "hedwig"
- `is_telegram_user`: true
- `telegram_id`: User's Telegram ID
- `display_name`: Formatted display name

**Telegram Properties:**
- `username`: @username (if available)
- `first_name`: User's first name
- `last_name`: User's last name (if available)
- `language_code`: User's language
- `is_premium`: Premium status
- `is_bot`: false

**Timestamps:**
- `created_at`: First identification time
- `first_seen`: First interaction
- `last_seen`: Latest interaction

### Step 5: Event Verification

In PostHog "Events" or "Explore" tab, verify:

1. **Identification Events:**
   - Event: `$identify`
   - Contains user properties in `$set`
   - Has `$process_person_profile: true`

2. **Bot Lifecycle Events:**
   - `bot_started`: When user starts bot
   - `bot_stopped`: When user stops bot

3. **Command Events:**
   - `command_used`: When user runs commands
   - `command_completed`: When commands finish

4. **Message Events:**
   - `message_received`: All incoming messages
   - `text_message_analyzed`: Text message analysis

5. **Feature Events:**
   - `offramp_opened`: Offramp feature usage
   - `withdraw_initiated`: Withdrawal actions
   - Custom feature events

## 🐛 Troubleshooting

### Users Not Appearing in "Persons" Tab

**Check:**
1. `$identify` events are being sent
2. `$process_person_profile: true` is set
3. `distinct_id` is consistent across events
4. API key and host are correct

**Debug:**
```typescript
// Enable debug mode
process.env.POSTHOG_DEBUG = 'true';

// Check identification
const result = await UserIdentificationService.identifyUser(user, true);
console.log('Identification result:', result);
```

### Events Not Linked to Users

**Check:**
1. Same `distinct_id` used for identification and events
2. Events sent after user identification
3. `$process_person_profile: true` in event properties

**Fix:**
```typescript
// Always use UserIdentificationService for events
await UserIdentificationService.trackEventWithIdentification(
  user,
  'your_event',
  properties
);
```

### Missing User Properties

**Check:**
1. User object has required properties
2. Properties are in `$set` object of `$identify` event
3. Property names match expected format

**Debug:**
```typescript
const profile = UserIdentificationService.extractTelegramUserProfile(user);
console.log('User profile:', profile);
```

### Performance Issues

**Optimize:**
1. Use batch sending for multiple events
2. Implement user identification caching
3. Avoid identifying same user repeatedly

```typescript
// Cache user identification
const identifiedUsers = new Set<string>();

if (!identifiedUsers.has(user.id)) {
  await UserIdentificationService.identifyUser(user);
  identifiedUsers.add(user.id);
}
```

## 📊 Analytics Best Practices

### 1. User Identification Strategy
- Identify users on first interaction
- Update properties when they change
- Use consistent `distinct_id` (Telegram user ID)

### 2. Event Naming Convention
- Use snake_case for event names
- Include category in properties
- Be descriptive but concise

### 3. Property Management
- Set core properties in `$identify`
- Use event properties for context
- Avoid sensitive information

### 4. Error Handling
- Track errors with context
- Include user information
- Log for debugging

### 5. Performance
- Batch events when possible
- Cache user identification
- Use async/await properly

## 🚀 Advanced Features

### Custom User Segmentation

```typescript
// Track user segments
await UserIdentificationService.trackEventWithIdentification(
  user,
  'user_segmented',
  {
    segment: 'premium_users',
    criteria: 'is_premium',
    value: user.is_premium
  }
);
```

### Cohort Analysis

```typescript
// Track user cohorts
const cohort = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;

await UserIdentificationService.updateUserProperties(user.id, {
  signup_cohort: cohort,
  signup_month: new Date().getMonth() + 1,
  signup_year: new Date().getFullYear()
});
```

### Feature Flags Integration

```typescript
// Track feature flag usage
await UserIdentificationService.trackEventWithIdentification(
  user,
  'feature_flag_evaluated',
  {
    flag_name: 'new_ui_enabled',
    flag_value: true,
    user_segment: 'beta_testers'
  }
);
```

## ✅ Verification Checklist

- [ ] PostHog API key configured
- [ ] User identification service integrated
- [ ] Analytics middleware added to bot
- [ ] Test script runs successfully
- [ ] Users appear in PostHog "Persons" tab
- [ ] Events linked to user profiles
- [ ] User properties populated correctly
- [ ] Error tracking implemented
- [ ] Performance optimized
- [ ] Debug logging available

## 📚 Additional Resources

- [PostHog Identify API Documentation](https://posthog.com/docs/api/post-only-endpoints#identify)
- [PostHog Event Tracking](https://posthog.com/docs/api/post-only-endpoints#capture)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [User Properties Best Practices](https://posthog.com/docs/data/user-properties)

---

**Next Steps:**
1. Run the test script to verify setup
2. Integrate user identification into your bot
3. Test with real users
4. Monitor PostHog dashboard for user profiles
5. Implement additional analytics as needed