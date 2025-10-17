# Intent Detection Priority Fix

## Issues Fixed:

### 1. Onramp Intent Interfering with Payment Link Creation
**Problem**: The system was detecting onramp intent instead of payment link intent for messages like "Create payment link for 1 usdc on base for web development"

**Root Cause**: Intent parser processes intents in order, and onramp detection came before payment link detection. If any onramp pattern matched (even incorrectly), it would never reach payment link detection.

### 2. Bot Integration vs Webhook Handling
**Status**: ✅ Already correctly configured
- Bot integration has the correct handler that returns `false` to let actions.ts handle payment links
- No changes needed here

## Changes Made:

### In `src/lib/intentParser.ts`:

1. **Moved Payment Link Detection Before Onramp**:
   ```typescript
   // BEFORE: Onramp detection at l