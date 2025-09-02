# PostHog Integration Troubleshooting Guide

## Overview

This guide helps you troubleshoot PostHog REST API integration issues in your Telegram bot. The implementation has been updated with improved error handling, proper endpoint detection, and comprehensive debugging.

## Current Setup Analysis

### ✅ What's Working
- **Programming Language**: Node.js/TypeScript
- **Implementation**: Direct HTTP API calls (no SDK dependency)
- **Endpoints**: Automatic detection based on POSTHOG_HOST
- **Error Handling**: Comprehensive retry logic with exponential backoff
- **Debugging**: Detailed logging in development mode

### 🔧 What Was Fixed

1. **Incorrect Endpoint URLs**
   - **Before**: Using `/capture/` endpoint
   - **After**: Using correct `/i/v0/e/` for single events and `/batch/` for batch events

2. **Missing Payload Validation**
   - **Before**: No validation of required fields
   - **After**: Validates `event` and `distinct_id` before sending

3. **Poor Error Handling**
   - **Before**: Silent failures with minimal logging
   - **After**: Detailed error messages, response logging, and fallback mechanisms

4. **Endpoint Detection**
   - **Before**: Hardcoded endpoints
   - **After**: Automatic detection based on PostHog instance type

## Environment Configuration

### Required Environment Variables

Add these to your `.env.local` file:

```bash
# PostHog Analytics configuration
POSTHOG_API_KEY=phc_your_posthog_api_key_here
POSTHOG_HOST=https://us.i.posthog.com  # or eu.i.posthog.com for EU
```

### Endpoint Detection Logic

The system automatically detects the correct endpoints:

| POSTHOG_HOST | Single Event Endpoint | Batch Endpoint |
|--------------|----------------------|----------------|
| `https://us.i.posthog.com` | `https://us.i.posthog.com/i/v0/e/` | `https://us.i.posthog.com/batch/` |
| `https://eu.i.posthog.com` | `https://eu.i.posthog.com/i/v0/e/` | `https://eu.i.posthog.com/batch/` |
| `https://app.posthog.com` | `https://us.i.posthog.com/i/v0/e/` | `https://us.i.posthog.com/batch/` |
| `https://your-domain.com` | `https://your-domain.com/i/v0/e/` | `https://your-domain.com/batch/` |

## Testing Your Setup

### Quick Test

Run the test script to verify your configuration:

```bash
node test-posthog.js
```

This will:
1. ✅ Validate environment variables
2. 🧪 Test single event API
3. 🧪 Test batch event API
4. 🧪 Test trackEvent function
5. 📊 Provide detailed results

### Manual Testing in Code

```javascript
import { testPostHogConnection, trackEvent } from './src/lib/posthog';

// Test connection
const result = await testPostHogConnection('your_telegram_user_id');
console.log('Test result:', result);

// Track a test event
await trackEvent('telegram_message_sent', {
  chat_id: 123456789,
  message_type: 'text',
  command: '/start'
}, 'telegram_user_123');
```

## Common Issues & Solutions

### 1. Events Not Appearing in Dashboard

**Symptoms:**
- API returns 200 OK
- No events in PostHog dashboard
- No error messages

**Solutions:**

✅ **Check Required Fields**
```javascript
// ❌ Bad - missing distinct_id
const badPayload = {
  api_key: 'phc_...',
  event: 'test_event',
  // distinct_id: missing!
  properties: {}
};

// ✅ Good - all required fields
const goodPayload = {
  api_key: 'phc_...',
  event: 'test_event',
  distinct_id: 'user_123',
  properties: {}
};
```

✅ **Validate Event Name**
```javascript
// ❌ Bad - empty or invalid event names
await trackEvent('', {}, userId);  // Empty string
await trackEvent(null, {}, userId);  // Null
await trackEvent('   ', {}, userId);  // Whitespace only

// ✅ Good - valid event names
await trackEvent('user_signed_up', {}, userId);
await trackEvent('message_sent', {}, userId);
```

✅ **Check User ID**
```javascript
// ❌ Bad - empty distinct_id
await trackEvent('test', {}, '');  // Empty string
await trackEvent('test', {}, null);  // Null

// ✅ Good - valid user identifiers
await trackEvent('test', {}, 'telegram_123456789');
await trackEvent('test', {}, 'user_abc123');
```

### 2. API Key Issues

**Symptoms:**
- 401 Unauthorized errors
- "Invalid API key" messages

**Solutions:**

✅ **Use Project API Key (Not Personal Token)**
- Go to: `https://app.posthog.com/project/settings`
- Copy the "Project API Key" (starts with `phc_`)
- NOT the "Personal API Token"

✅ **Verify Key Format**
```bash
# ✅ Correct format
POSTHOG_API_KEY=phc_1234567890abcdef1234567890abcdef12345678

# ❌ Wrong format
POSTHOG_API_KEY=1234567890abcdef  # Missing phc_ prefix
POSTHOG_API_KEY=phx_...  # Wrong prefix
```

### 3. Endpoint/Network Issues

**Symptoms:**
- Connection timeouts
- 404 Not Found errors
- Network errors

**Solutions:**

✅ **Verify Instance Type**
```bash
# US Cloud (most common)
POSTHOG_HOST=https://us.i.posthog.com

# EU Cloud
POSTHOG_HOST=https://eu.i.posthog.com

# Self-hosted
POSTHOG_HOST=https://your-posthog-domain.com
```

✅ **Test Network Connectivity**
```bash
# Test if you can reach PostHog
curl -X POST https://us.i.posthog.com/i/v0/e/ \
  -H "Content-Type: application/json" \
  -d '{"api_key":"your_key","event":"test","distinct_id":"test"}'
```

### 4. Silent Failures

**Symptoms:**
- 200 OK response
- Events not ingested
- No error messages

**Common Causes:**
- Empty `event` field
- Missing `distinct_id`
- Empty `distinct_id` value
- Invalid JSON payload

**Solution:**
The updated implementation validates all these cases and provides detailed error messages.

## Debug Mode

Enable debug mode for detailed logging:

```bash
NODE_ENV=development
```

This will log:
- 📤 Exact payload being sent
- 🌐 API endpoint URLs
- 📥 Response status and headers
- 📊 Response body content
- ⚠️ Validation warnings

## Best Practices

### 1. Event Naming
```javascript
// ✅ Good - descriptive, consistent naming
await trackEvent('telegram_message_sent', properties, userId);
await trackEvent('proposal_created', properties, userId);
await trackEvent('invoice_generated', properties, userId);

// ❌ Bad - unclear, inconsistent naming
await trackEvent('msg', properties, userId);
await trackEvent('thing_happened', properties, userId);
```

### 2. User Identification
```javascript
// ✅ Good - use Telegram user ID
const userId = message.from.id.toString();
await trackEvent('message_received', {
  chat_id: message.chat.id,
  message_type: message.text ? 'text' : 'other'
}, userId);

// ❌ Bad - anonymous or missing user ID
await trackEvent('message_received', properties);  // No user ID
await trackEvent('message_received', properties, 'anonymous');
```

### 3. Error Handling
```javascript
// ✅ Good - proper error handling
try {
  await trackEvent('user_action', properties, userId);
} catch (error) {
  console.error('Analytics tracking failed:', error);
  // Continue with main application logic
}

// ❌ Bad - blocking on analytics
await trackEvent('user_action', properties, userId);  // Blocks if fails
```

### 4. Properties Structure
```javascript
// ✅ Good - structured, meaningful properties
await trackEvent('proposal_created', {
  proposal_id: proposal.id,
  amount: proposal.amount,
  currency: proposal.currency,
  client_type: 'individual',
  feature: 'proposals'
}, userId);

// ❌ Bad - unstructured or meaningless properties
await trackEvent('proposal_created', {
  data: JSON.stringify(proposal),  // Don't stringify objects
  random_field: 'value'
}, userId);
```

## Verification Steps

1. **Run Test Script**: `node test-posthog.js`
2. **Check Console Logs**: Look for success/error messages
3. **Wait 2-5 Minutes**: PostHog has ingestion delay
4. **Check Dashboard**: Go to PostHog → Live Events
5. **Verify Events**: Look for test events with correct properties
6. **Test Real Usage**: Track actual bot interactions

## Support

If you're still experiencing issues:

1. **Run the test script** and share the output
2. **Check PostHog status**: https://status.posthog.com/
3. **Verify your PostHog plan** supports API access
4. **Contact PostHog support** with specific error messages

## Updated Implementation Summary

The PostHog integration now includes:

- ✅ Correct API endpoints for all instance types
- ✅ Comprehensive payload validation
- ✅ Detailed error logging and debugging
- ✅ Retry logic with exponential backoff
- ✅ Fallback to batch API if single events fail
- ✅ Test function for easy troubleshooting
- ✅ Proper TypeScript types and interfaces
- ✅ Environment-based configuration

Your PostHog integration should now work reliably with proper error reporting and debugging capabilities.