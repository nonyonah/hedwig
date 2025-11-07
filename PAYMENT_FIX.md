# Payment Initiation Fix

## Issue
Payment initiation was failing with 404 error because:
1. The code was trying to query `invoice_id` column which doesn't exist in the database yet
2. This caused the entire milestone query to fail

## Solution
Made the payment flow resilient to missing `invoice_id` column:

### Changes Made

1. **Removed `invoice_id` from milestone query** (`initiate-payment.ts` line 40-51)
   - No longer queries the `invoice_id` field from `contract_milestones`
   - Prevents query failure if column doesn't exist

2. **Check for existing invoices differently** (lines 140-149)
   - Query the `invoices` table directly
   - Match by `project_contract_id` and milestone title
   - Find most recent invoice if it exists

3. **Made invoice_id update optional** (lines 197-209)
   - Wrapped in try-catch block
   - Won't fail if column doesn't exist
   - Logs warning but continues with payment flow

4. **Added comprehensive logging** (throughout file)
   - Track contract lookup
   - Track invoice creation
   - Track all steps of payment flow

## How It Works Now

1. ✅ Query milestone (without invoice_id field)
2. ✅ Query contract details
3. ✅ Get freelancer wallet
4. ✅ Check for existing invoice in invoices table
5. ✅ Create new invoice if needed
6. ✅ Try to update milestone (won't fail if column missing)
7. ✅ Update payment status to 'processing'
8. ✅ Redirect to invoice page

## Testing

The payment flow should now work WITHOUT needing to run the database migration first.

However, for optimal performance, you should still run the migration:

```sql
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS invoice_id UUID;
CREATE INDEX IF NOT EXISTS idx_contract_milestones_invoice_id ON contract_milestones(invoice_id);
```

## Expected Logs

When payment is initiated, you should see:
```
[Initiate Payment] Starting payment initiation for milestone: ...
[Initiate Payment] Milestone found: { id, title, status, payment_status }
[Initiate Payment] Fetching contract: ...
[Initiate Payment] Contract found: { id, title, freelancer_id, freelancer_wallet }
[Initiate Payment] No existing invoice found, creating new one
[Initiate Payment] Invoice created: ...
[Initiate Payment] Could not update milestone with invoice_id (column may not exist): ...
[Initiate Payment] Payment initiation successful, redirecting to: ...
```

The warning about invoice_id is expected if you haven't run the migration yet.
