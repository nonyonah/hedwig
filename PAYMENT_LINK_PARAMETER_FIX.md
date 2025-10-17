# Payment Link Parameter Extraction Fix

## Issue Identified:
From the logs, the payment link creation was failing because:
1. Intent parser correctly detected `create_payment_link` intent
2. Only extracted `network: 'base'` parameter
3. Original text `"Create payment link for 1 usdc on base for web development"` was not passed to `handleCreatePaymentLink`
4. Result: All other parameters (amount, token, description) were `undefined`

## Root Causes:

### 1. Missing Text Parameter
- The original user message was not being passed to `handleAction`
- `handleCreatePaymentLink` needs the original text to extract parameters

### 2. Limited Intent Parser Extraction
- Intent parser only extracted network parameter
- Should extract amount, token, description, and email from the text

## Fixes Applied:

### In `src/pages/api/webhook.ts`:
```typescript
// Before:
const actionResult = await handleAction(intent, params, userId);

// After:
const enhancedParams = { ...params, text: userMessage };
const actionResult = await handleAction(intent, enhancedParams, userId);
```

### In `src/lib/intentParser.ts`:
Enhanced payment link parameter extraction to include:
- **Amount & Token**: `1 usdc`, `$100`, `50 USDC`
- **Network**: `on base`, `on celo`
- **Description**: `for web development`, `for consulting`
- **Email**: `send to client@example.com`

```typescript
// Extract amount and token
const amountTokenMatch = text.match(/(\d+(?:\.\d+)?)\s*(eth|sol|usdc|usdt|btc|matic|avax|bnb|ada|dot|link|uni|celo|lsk|cusd)/i) ||
                         text.match(/\$(\d+(?:\.\d+)?)/i);

// Extract payment reason/description
const reasonPatterns = [
  /for\s+(.+?)(?:\s+on\s+\w+|\s+send\s+to|\s+to\s+\w+@|$)/i,
  /payment\s+link\s+.*?for\s+(.+?)(?:\s+on\s+\w+|\s+send\s+to|\s+to\s+\w+@|$)/i
];
```

### In `src/api/actions.ts`:
Added text parameter to debug logging:
```typescript
console.log('[handleCreatePaymentLink] Initial params:', {
  amount, token, network, recipient_email, paymentReason, description, finalPaymentReason, text: params.text
});
```

## Expected Results:

For input: `"Create payment link for 1 usdc on base for web development"`

**Before Fix:**
```
params: { network: 'base' }
Initial params: { amount: undefined, token: undefined, network: 'base', ... }
Result: Template shown
```

**After Fix:**
```
params: { 
  network: 'base', 
  amount: '1', 
  token: 'USDC', 
  description: 'web development',
  text: 'Create payment link for 1 usdc on base for web development'
}
Initial params: { amount: '1', token: 'USDC', network: 'base', description: 'web development', ... }
Result: Actual payment link created
```

## Test Cases Now Supported:
1. `"Create payment link for 1 usdc on base for web development"` ✅
2. `"payment link $100 for consulting"` ✅
3. `"create payment link 50 USDC on celo for design work, send to client@example.com"` ✅
4. `"payment link for freelance work"` ✅ (with defaults)

The system should now properly extract all parameters from natural language and create actual payment links instead of showing templates.