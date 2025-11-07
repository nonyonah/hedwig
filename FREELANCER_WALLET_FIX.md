# Freelancer Wallet Fix

## Issue
Payment initiation was failing with error:
```
column project_contracts.freelancer_wallet does not exist
```

Even though the contract page was successfully resolving the freelancer wallet to `0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27`.

## Root Cause
The `initiate-payment.ts` endpoint was trying to query a `freelancer_wallet` column from the `project_contracts` table, but this column doesn't exist in the database schema.

## Solution
Updated the payment initiation endpoint to:

1. **Remove `freelancer_wallet` from contract query**
   - Query only fields that actually exist in the table
   - Prevents the database error

2. **Enhanced wallet lookup logic**
   - First checks `wallets` table (preferred for EVM/Base wallets)
   - Falls back to `users` table `wallet_address` field
   - Logs where the wallet was found for debugging

3. **Better error handling**
   - Clear error message if wallet not found
   - Detailed logging at each step

## Code Changes

### Before:
```typescript
const { data: contract } = await supabase
  .from('project_contracts')
  .select(`
    id,
    project_title,
    freelancer_id,
    freelancer_wallet,  // ❌ This column doesn't exist
    client_email,
    currency,
    token_type
  `)
```

### After:
```typescript
const { data: contract } = await supabase
  .from('project_contracts')
  .select(`
    id,
    project_title,
    freelancer_id,
    client_email,
    currency,
    token_type
  `)

// Then separately query for wallet
const { data: wallets } = await supabase
  .from('wallets')
  .select('address, chain')
  .eq('user_id', contract.freelancer_id)
```

## Expected Logs

When payment is initiated, you should now see:
```
[Initiate Payment] Starting payment initiation for milestone: ...
[Initiate Payment] Milestone found: { id, title, status, payment_status }
[Initiate Payment] Fetching contract: ...
[Initiate Payment] Contract found: { id, title, freelancer_id }
[Initiate Payment] Found wallet in wallets table: 0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27
[Initiate Payment] No existing invoice found, creating new one
[Initiate Payment] Invoice created: ...
[Initiate Payment] Payment initiation successful, redirecting to: ...
```

## Testing

1. Click "💰 Generate Invoice & Pay" on an approved milestone
2. Should successfully create invoice and redirect to invoice page
3. Check logs to confirm wallet was found
4. Verify invoice was created in the database

## Status
✅ Fixed - Payment initiation should now work without database schema changes
