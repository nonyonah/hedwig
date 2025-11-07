# Invoice Names Fix

## Issue
Invoices were showing generic labels instead of actual names:
- **Freelancer**: "Freelancer" (instead of actual freelancer name)
- **Client**: "Client" (instead of actual client name)
- **Emails**: Empty or missing

## Solution
Enhanced the invoice creation to fetch and use actual user details from the database.

## Changes Made

### 1. Added `client_id` to Contract Query
**File**: `/src/pages/api/milestones/[id]/initiate-payment.ts`

```typescript
// Before
.select(`
  id,
  project_title,
  freelancer_id,
  client_email,
  currency,
  token_type
`)

// After
.select(`
  id,
  project_title,
  freelancer_id,
  client_id,        // ✅ Added
  client_email,
  currency,
  token_type
`)
```

### 2. Fetch Freelancer Details
**Lines 116-155**

```typescript
// Get freelancer details (wallet and name)
let freelancerWallet = null;
let freelancerName = 'Freelancer';
let freelancerEmail = '';

if (contract.freelancer_id) {
  const { data: freelancerUser } = await supabase
    .from('users')
    .select('wallet_address, username, first_name, last_name, email')
    .eq('id', contract.freelancer_id)
    .single();
  
  if (freelancerUser) {
    freelancerEmail = freelancerUser.email || '';
    freelancerName = freelancerUser.username || 
      `${freelancerUser.first_name || ''} ${freelancerUser.last_name || ''}`.trim() || 
      'Freelancer';
    
    if (freelancerUser.wallet_address) {
      freelancerWallet = freelancerUser.wallet_address;
    }
  }
}
```

### 3. Fetch Client Details
**Lines 165-188**

```typescript
// Get client details
let clientName = 'Client';
let clientEmail = contract.client_email || '';

if (contract.client_id) {
  const { data: clientUser } = await supabase
    .from('users')
    .select('username, first_name, last_name, email')
    .eq('id', contract.client_id)
    .single();
  
  if (clientUser) {
    clientEmail = clientUser.email || contract.client_email || '';
    clientName = clientUser.username || 
      `${clientUser.first_name || ''} ${clientUser.last_name || ''}`.trim() || 
      'Client';
  }
}
```

### 4. Use Actual Names in Invoice Creation
**Lines 213-217**

```typescript
// Before
.insert({
  freelancer_name: 'Freelancer',  // ❌ Generic
  freelancer_email: '',
  client_name: 'Client',          // ❌ Generic
  client_email: contract.client_email || '',
  ...
})

// After
.insert({
  freelancer_name: freelancerName,  // ✅ Actual name
  freelancer_email: freelancerEmail,
  client_name: clientName,          // ✅ Actual name
  client_email: clientEmail,
  ...
})
```

## Name Resolution Logic

### Freelancer Name Priority:
1. `username` from users table
2. `first_name + last_name` from users table
3. Fallback: "Freelancer"

### Client Name Priority:
1. `username` from users table
2. `first_name + last_name` from users table
3. Fallback: "Client"

## Expected Logs

When creating an invoice, you should see:
```
[Initiate Payment] Found wallet in users table: 0x...
[Initiate Payment] Client name: John Doe
[Initiate Payment] Invoice parties: {
  freelancer: 'Alice Smith',
  client: 'John Doe'
}
[Initiate Payment] Creating invoice with wallet: 0x...
[Initiate Payment] Invoice created: <invoice_id>
```

## Invoice Display

The invoice will now show:

**From (Freelancer):**
- Name: Alice Smith (or username)
- Email: alice@example.com
- Wallet: 0x12cfCA6f...

**To (Client):**
- Name: John Doe (or username)
- Email: john@example.com

## Testing

1. Navigate to a contract with an approved milestone
2. Click "💰 Generate Invoice & Pay"
3. Check logs for name resolution:
   ```
   [Initiate Payment] Client name: ...
   [Initiate Payment] Invoice parties: { freelancer: '...', client: '...' }
   ```
4. View the generated invoice
5. Verify:
   - ✅ Freelancer name is displayed (not "Freelancer")
   - ✅ Client name is displayed (not "Client")
   - ✅ Email addresses are populated
   - ✅ Wallet address is configured

## Benefits

1. **Professional invoices** with actual names
2. **Better tracking** - know who the invoice is for
3. **Email notifications** can use correct recipient names
4. **Audit trail** - clear record of parties involved

## Status
✅ Fixed - Invoices now display actual freelancer and client names with emails
