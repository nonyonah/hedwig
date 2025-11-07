# Invoice Wallet Configuration Fix

## Issue
When viewing the generated invoice, the error appeared:
```
"Freelancer wallet address is not configured for this invoice."
```

Even though the freelancer wallet was successfully resolved and available in the contract.

## Root Cause
**Field name mismatch** between invoice creation and invoice retrieval:

1. **Invoice Creation** (`initiate-payment.ts`): 
   - Was setting `freelancer_wallet: freelancerWallet`

2. **Invoice Retrieval** (`/api/invoices/[id].ts`):
   - Was looking for `wallet_address` field
   - Line 29: `const walletAddress = (invoice as any).wallet_address || '';`

3. **Invoice Display** (`/invoice/[id].tsx`):
   - Uses `invoiceData.fromCompany.walletAddress` for payment
   - This comes from the `wallet_address` field in the database

## Solution
Changed the invoice creation to use the correct field name:

### Before:
```typescript
.insert({
  freelancer_wallet: freelancerWallet,  // ❌ Wrong field name
  ...
})
```

### After:
```typescript
.insert({
  wallet_address: freelancerWallet,  // ✅ Correct field name
  ...
})
```

## Code Changes

**File**: `/src/pages/api/milestones/[id]/initiate-payment.ts`

**Line 180**: Changed from `freelancer_wallet` to `wallet_address`

Added logging to track the wallet being used:
```typescript
console.log('[Initiate Payment] Creating invoice with wallet:', freelancerWallet);
```

## How It Works Now

1. ✅ Freelancer wallet is resolved from `wallets` or `users` table
2. ✅ Invoice is created with `wallet_address` field set correctly
3. ✅ Invoice API retrieves the `wallet_address` field
4. ✅ Invoice page displays the wallet in `fromCompany.walletAddress`
5. ✅ Payment button works with the configured wallet

## Expected Flow

```
Contract Page
    ↓
Click "💰 Generate Invoice & Pay"
    ↓
[Initiate Payment] Found wallet: 0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27
[Initiate Payment] Creating invoice with wallet: 0x12cfCA6f4004cc063deAD5F0a6ac7BeF1FC7CF27
[Initiate Payment] Invoice created: <invoice_id>
    ↓
Redirect to /invoice/<invoice_id>
    ↓
Invoice page loads with wallet configured
    ↓
✅ "Pay with Crypto" button is enabled
```

## Testing

1. Navigate to a contract with an approved milestone
2. Click "💰 Generate Invoice & Pay"
3. Check logs for wallet resolution:
   ```
   [Initiate Payment] Found wallet in wallets table: 0x...
   [Initiate Payment] Creating invoice with wallet: 0x...
   ```
4. Invoice page should load without the wallet error
5. "Pay with Crypto" button should be enabled
6. Payment should process successfully

## Database Schema Note

The `invoices` table uses `wallet_address` as the field name for the freelancer's wallet address. This is consistent with how other parts of the system (like payment links) work.

## Status
✅ Fixed - Invoice now correctly stores and retrieves the freelancer wallet address
