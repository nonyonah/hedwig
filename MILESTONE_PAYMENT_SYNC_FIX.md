# Milestone Payment Status Sync Fix

## Issue
After a user paid for a milestone via invoice, the contract page still showed "💰 Generate Invoice & Pay" button instead of recognizing the milestone as paid.

## Root Cause
There was no automatic synchronization between invoice payment status and milestone payment status. When an invoice was marked as 'paid', the corresponding milestone's `payment_status` remained as 'unpaid' or 'processing'.

## Solution
Implemented automatic milestone payment status updates when invoices are paid.

## Changes Made

### 1. Invoice Status Update Endpoint
**File**: `/src/pages/api/invoices/[id]/status.ts`

Added logic to automatically update milestone payment status when invoice is marked as paid.

**Two-Method Approach** (Lines 116-188):

#### Method 1: Direct Lookup by invoice_id
```typescript
// Try to find milestone by invoice_id (if column exists)
const { data: milestoneByInvoiceId } = await supabase
  .from('contract_milestones')
  .select('id, title, payment_status')
  .eq('invoice_id', id)
  .eq('status', 'approved')
  .in('payment_status', ['unpaid', 'processing'])
  .maybeSingle();
```

**Why**: If the `invoice_id` column exists in the milestone, this is the most accurate way to find the linked milestone.

#### Method 2: Fallback - Match by Description
```typescript
// Match milestone by checking if invoice description contains milestone title
const invoiceDescription = data[0].project_description || '';
matchedMilestone = milestones.find(m => 
  invoiceDescription.toLowerCase().includes(m.title.toLowerCase())
);
```

**Why**: If `invoice_id` column doesn't exist or no match found, we match by comparing the invoice description with milestone titles.

#### Update Milestone
```typescript
await supabase
  .from('contract_milestones')
  .update({
    payment_status: 'paid',
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .eq('id', matchedMilestone.id);
```

### 2. Mark Paid Endpoint
**File**: `/src/pages/api/invoices/[id]/mark-paid.ts`

Added similar logic for manual invoice payment marking (Lines 107-138).

```typescript
// Update milestone payment status if this invoice is linked to a milestone
if (invoice.contract_id) {
  const { data: milestones } = await supabase
    .from('contract_milestones')
    .select('id, title, payment_status')
    .eq('contract_id', invoice.contract_id)
    .eq('status', 'approved')
    .in('payment_status', ['unpaid', 'processing']);
  
  const matchedMilestone = milestones.find(m => 
    invoiceTitle.toLowerCase().includes(m.title.toLowerCase())
  );
  
  if (matchedMilestone) {
    await supabase
      .from('contract_milestones')
      .update({
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', matchedMilestone.id);
  }
}
```

## How It Works

### Payment Flow:

1. **User clicks "💰 Generate Invoice & Pay"**
   - Invoice created with milestone title in description
   - Milestone `payment_status` set to 'processing'
   - Optional: `invoice_id` stored in milestone (if column exists)

2. **User pays the invoice**
   - Payment processed through blockchain
   - Invoice status updated to 'paid' via `/api/invoices/[id]/status` endpoint

3. **Automatic Milestone Update** (NEW!)
   - System detects invoice is paid
   - Finds linked milestone using:
     - Primary: `invoice_id` match
     - Fallback: Description contains milestone title
   - Updates milestone:
     - `payment_status`: 'paid'
     - `paid_at`: Current timestamp
     - `updated_at`: Current timestamp

4. **UI Updates**
   - Contract page refreshes
   - "💰 Generate Invoice & Pay" button disappears
   - Milestone shows as paid ✅

## Expected Logs

### When Invoice is Paid:
```
[Invoice Status] Invoice paid, updating milestone payment status
[Invoice Status] Found milestone by invoice_id: <milestone_id>
[Invoice Status] Updating milestone payment status: {
  milestone_id: '<milestone_id>',
  milestone_title: 'Final Implementation',
  old_status: 'processing',
  new_status: 'paid'
}
[Invoice Status] Milestone payment status updated successfully
```

### If invoice_id Column Doesn't Exist:
```
[Invoice Status] Invoice paid, updating milestone payment status
[Invoice Status] invoice_id column may not exist, trying alternative method
[Invoice Status] Found milestone by description match: <milestone_id>
[Invoice Status] Updating milestone payment status: { ... }
[Invoice Status] Milestone payment status updated successfully
```

### If No Milestone Found:
```
[Invoice Status] Invoice paid, updating milestone payment status
[Invoice Status] No matching milestone found for this invoice
```

## Matching Logic

### Primary Method (invoice_id):
- **Pros**: Direct, accurate, no ambiguity
- **Cons**: Requires `invoice_id` column in database
- **When**: If migration has been run

### Fallback Method (Description):
- **Pros**: Works without schema changes
- **Cons**: Relies on milestone title being in invoice description
- **When**: Always available as backup

### Matching Criteria:
```typescript
// Invoice description: "Web design - Final Implementation"
// Milestone title: "Final Implementation"
// Match: ✅ (case-insensitive substring match)
```

## Frontend Impact

### Before Fix:
```
Milestone: Final Implementation
Status: Approved ✅
Payment: Processing 🔄
Button: [💰 Generate Invoice & Pay]  ← Still showing!
```

### After Fix:
```
Milestone: Final Implementation
Status: Approved ✅
Payment: Paid ✅
Paid At: Nov 7, 2025
Button: (no button - milestone is paid)
```

## Testing

### Test Case 1: Normal Payment Flow
1. Approve a milestone
2. Click "💰 Generate Invoice & Pay"
3. Pay the invoice via crypto
4. Wait for blockchain confirmation
5. ✅ Milestone should show as paid
6. ✅ Payment button should disappear

### Test Case 2: Manual Payment Marking
1. Create invoice for milestone
2. Manually mark invoice as paid in admin
3. ✅ Milestone should update to paid

### Test Case 3: Multiple Milestones
1. Contract with 3 milestones
2. Pay invoice for milestone #2
3. ✅ Only milestone #2 should be marked as paid
4. ✅ Other milestones remain unpaid

## Database Fields Updated

### Milestone Fields:
- `payment_status`: 'unpaid' → 'paid'
- `paid_at`: NULL → timestamp
- `updated_at`: Updated to current time

### Invoice Fields (already updated):
- `status`: 'draft'/'sent' → 'paid'
- `paid_at`: timestamp
- `payment_transaction`: transaction hash

## Benefits

1. ✅ **Automatic synchronization** - No manual intervention needed
2. ✅ **Accurate UI** - Contract page reflects actual payment status
3. ✅ **Dual method** - Works with or without invoice_id column
4. ✅ **Detailed logging** - Easy to debug issues
5. ✅ **Non-blocking** - Doesn't fail if milestone update fails

## Status
✅ Fixed - Milestone payment status now automatically syncs when invoice is paid
