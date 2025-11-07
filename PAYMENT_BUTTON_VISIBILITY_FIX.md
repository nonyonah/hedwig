# Payment Button Visibility Fix

## Issue
The "💰 Generate Invoice & Pay" button was not showing for approved milestones that haven't been paid yet (specifically the second milestone).

## Root Causes

### 1. Incorrect Button Condition
The button condition was:
```typescript
milestone.payment_status !== 'paid'
```

This doesn't explicitly handle cases where `payment_status` is:
- `null` (not set)
- `undefined` (field missing)
- `'unpaid'` (explicitly unpaid)
- `'processing'` (invoice generated but not paid)

### 2. Users Table Column Names
The code was querying non-existent columns:
- `first_name` ❌
- `last_name` ❌

Actual column is:
- `name` ✅

## Solutions Implemented

### 1. Fix Button Visibility Condition
**File**: `/src/components/ui/ProgressBar.tsx` (Line 321)

#### Before:
```typescript
{isClient && milestone.status === 'approved' && milestone.payment_status !== 'paid' && (
  <button>💰 Generate Invoice & Pay</button>
)}
```

#### After:
```typescript
{isClient && milestone.status === 'approved' && 
 (!milestone.payment_status || milestone.payment_status === 'unpaid' || milestone.payment_status === 'processing') && (
  <button>💰 Generate Invoice & Pay</button>
)}
```

**Why**: Explicitly checks for all non-paid states:
- `!milestone.payment_status` - null or undefined
- `milestone.payment_status === 'unpaid'` - explicitly unpaid
- `milestone.payment_status === 'processing'` - invoice generated but not paid

### 2. Fix Users Table Column Names
**File**: `/src/pages/api/milestones/[id]/initiate-payment.ts`

#### Before:
```typescript
const { data: freelancerUser } = await supabase
  .from('users')
  .select('username, first_name, last_name, email') // ❌ Columns don't exist
  .eq('id', contract.freelancer_id)
  .single();

freelancerName = freelancerUser.username || 
  `${freelancerUser.first_name} ${freelancerUser.last_name}`.trim() || 
  'Freelancer';
```

#### After:
```typescript
const { data: freelancerUser } = await supabase
  .from('users')
  .select('username, name, email') // ✅ Correct columns
  .eq('id', contract.freelancer_id)
  .single();

freelancerName = freelancerUser.username || freelancerUser.name || 'Freelancer';
```

**Applied to both**:
- Freelancer user lookup (Lines 155-174)
- Client user lookup (Lines 202-219)

## Button Visibility Logic

### Show Button When:
```
✅ User is client (isClient = true)
AND
✅ Milestone status is 'approved'
AND
✅ Payment status is one of:
   - null/undefined (not set)
   - 'unpaid' (explicitly unpaid)
   - 'processing' (invoice created but not paid)
```

### Hide Button When:
```
❌ User is freelancer
OR
❌ Milestone status is NOT 'approved'
OR
❌ Payment status is 'paid'
OR
❌ Payment status is 'failed'
```

## Expected Behavior

### Scenario 1: New Approved Milestone
```
Milestone: Design Phase
Status: approved
Payment Status: null (or undefined)
Button: ✅ Shows "💰 Generate Invoice & Pay"
```

### Scenario 2: Invoice Generated
```
Milestone: Design Phase
Status: approved
Payment Status: processing
Button: ✅ Shows "💰 Generate Invoice & Pay"
```

### Scenario 3: Paid Milestone
```
Milestone: Design Phase
Status: approved
Payment Status: paid
Button: ❌ Hidden
```

### Scenario 4: Unpaid Milestone
```
Milestone: Design Phase
Status: approved
Payment Status: unpaid
Button: ✅ Shows "💰 Generate Invoice & Pay"
```

## Expected Logs

### With Fixed Column Names:
```
[Initiate Payment] Freelancer details: {
  name: 'John Doe',
  email: 'john@example.com'
}
[Initiate Payment] Client details: {
  name: 'Jane Smith',
  email: 'jane@example.com'
}
[Initiate Payment] Invoice parties: {
  freelancer: 'John Doe',
  client: 'Jane Smith'
}
```

### Before Fix (Error):
```
[Initiate Payment] Error fetching freelancer: {
  code: '42703',
  message: 'column users.first_name does not exist'
}
[Initiate Payment] Invoice parties: {
  freelancer: 'Freelancer',
  client: 'Client'
}
```

## Testing

### Test Case 1: Check Second Milestone
1. Navigate to contract page
2. Look at the second milestone
3. ✅ If approved and not paid, button should show
4. ✅ Click button to generate invoice

### Test Case 2: Check All Payment States
1. **Null/Undefined**: New approved milestone → ✅ Button shows
2. **Unpaid**: Explicitly unpaid milestone → ✅ Button shows
3. **Processing**: Invoice generated → ✅ Button shows
4. **Paid**: Payment completed → ❌ Button hidden

### Test Case 3: Verify User Names
1. Generate invoice for milestone
2. Check server logs
3. ✅ Should show actual user names (not "Freelancer"/"Client")
4. ✅ No column errors in logs

## Database Schema

### Users Table Columns:
- ✅ `id` - UUID
- ✅ `username` - String (optional)
- ✅ `name` - String (full name)
- ✅ `email` - String
- ❌ `first_name` - Does NOT exist
- ❌ `last_name` - Does NOT exist

### Milestone Payment Status Values:
- `null` / `undefined` - Not set (default for new milestones)
- `'unpaid'` - Explicitly marked as unpaid
- `'processing'` - Invoice generated, awaiting payment
- `'paid'` - Payment completed
- `'failed'` - Payment failed

## Benefits

1. ✅ **Button shows for all unpaid states** - Covers null, unpaid, and processing
2. ✅ **No column errors** - Uses correct 'name' field
3. ✅ **Actual user names** - Shows real names instead of placeholders
4. ✅ **Consistent behavior** - All approved unpaid milestones show button

## Status
✅ Fixed - Payment button now shows for all approved unpaid milestones, and user names are fetched correctly
