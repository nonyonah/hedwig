# Contract Approval Debugging Guide

This guide helps debug issues with contract approval, invoice generation, and notifications.

## Quick Test Commands

### 1. List Available Contracts
```bash
curl -X POST "http://localhost:3000/api/test-contract-approval" \
  -H "Content-Type: application/json" \
  -d '{"action": "list_contracts"}'
```

### 2. Check Contract Details
```bash
curl -X POST "http://localhost:3000/api/test-contract-approval" \
  -H "Content-Type: application/json" \
  -d '{"action": "check_contract", "contractId": "YOUR_CONTRACT_ID"}'
```

### 3. Test Contract Approval
```bash
curl -X POST "http://localhost:3000/api/test-contract-approval" \
  -H "Content-Type: application/json" \
  -d '{"action": "test_approval", "contractId": "YOUR_CONTRACT_ID"}'
```

### 4. Test Notifications Directly
```bash
curl -X POST "http://localhost:3000/api/test-notifications-simple"
```

## What Should Happen After Contract Approval

### ✅ **For Freelancers:**
1. **Email Notification** - Congratulations email with contract details
2. **Telegram Notification** - Real-time message (if Telegram is connected)
3. **Invoice Generation** - Invoices created for each milestone

### ✅ **For Clients:**
1. **Invoice Email** - Notification that invoices are ready
2. **Payment Instructions** - How to pay using cryptocurrency

## Common Issues & Solutions

### Issue 1: No Email Notifications
**Symptoms:** Contract approved but no emails sent
**Check:**
- Environment variables: `RESEND_API_KEY`, `EMAIL_FROM`
- Freelancer has valid email in database
- Check server logs for email errors

**Debug:**
```bash
# Check if freelancer exists and has email
curl -X POST "http://localhost:3000/api/test-contract-approval" \
  -H "Content-Type: application/json" \
  -d '{"action": "check_contract", "contractId": "CONTRACT_ID"}'
```

### Issue 2: No Telegram Notifications
**Symptoms:** Email works but no Telegram messages
**Check:**
- Environment variable: `TELEGRAM_BOT_TOKEN`
- Freelancer has `telegram_user_id` in database
- Bot has permission to message the user

**Debug:**
```bash
# Check freelancer's Telegram ID
curl -X POST "http://localhost:3000/api/test-contract-approval" \
  -H "Content-Type: application/json" \
  -d '{"action": "check_contract", "contractId": "CONTRACT_ID"}'
```

### Issue 3: No Invoices Generated
**Symptoms:** Contract approved but no invoices created
**Check:**
- Contract has milestones defined
- Database permissions for `invoices` table
- Check server logs for invoice generation errors

**Debug:**
```bash
# Check if milestones exist
curl -X POST "http://localhost:3000/api/test-contract-approval" \
  -H "Content-Type: application/json" \
  -d '{"action": "check_contract", "contractId": "CONTRACT_ID"}'
```

### Issue 4: Client Not Receiving Invoice Emails
**Symptoms:** Freelancer gets notified but client doesn't
**Check:**
- Contract has valid `client_email`
- Email service is working
- Check spam folder

## Environment Variables Required

```bash
# Email Service
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# App URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## Database Tables to Check

### 1. Contract Data
```sql
SELECT id, project_title, status, freelancer_id, client_email, total_amount 
FROM project_contracts 
WHERE id = 'CONTRACT_ID';
```

### 2. Freelancer Data
```sql
SELECT id, email, username, telegram_user_id 
FROM users 
WHERE id = 'FREELANCER_ID';
```

### 3. Generated Invoices
```sql
SELECT id, project_contract_id, amount, status, created_at 
FROM invoices 
WHERE project_contract_id = 'CONTRACT_ID';
```

### 4. Contract Milestones
```sql
SELECT id, contract_id, title, amount, milestone_number 
FROM contract_milestones 
WHERE contract_id = 'CONTRACT_ID';
```

## Server Logs to Monitor

When testing contract approval, watch for these log messages:

```
✅ Good Signs:
- "Successfully generated invoices for legacy contract: CONTRACT_ID"
- "Email notification sent to freelancer successfully"
- "Telegram notification sent to freelancer successfully"
- "Invoice notification sent to client successfully"

❌ Error Signs:
- "Failed to generate invoices for legacy contract"
- "Failed to send notification email"
- "Failed to send Telegram notification"
- "No freelancer email found for notifications"
```

## Step-by-Step Debugging Process

1. **Check Contract Exists**
   ```bash
   curl -X POST "localhost:3000/api/test-contract-approval" \
     -d '{"action": "check_contract", "contractId": "ID"}'
   ```

2. **Verify Freelancer Data**
   - Check response has freelancer email
   - Check telegram_user_id if Telegram notifications expected

3. **Test Approval Process**
   ```bash
   curl -X POST "localhost:3000/api/test-contract-approval" \
     -d '{"action": "test_approval", "contractId": "ID"}'
   ```

4. **Check Server Logs**
   - Look for success/error messages
   - Verify all steps completed

5. **Verify Results**
   - Check email inboxes (freelancer & client)
   - Check Telegram messages
   - Verify invoices were created

## Manual Testing Checklist

- [ ] Contract exists and has status 'created' or 'pending_approval'
- [ ] Freelancer has valid email address
- [ ] Freelancer has telegram_user_id (for Telegram notifications)
- [ ] Client has valid email address
- [ ] Contract has milestones defined
- [ ] Environment variables are set correctly
- [ ] Email service (Resend) is working
- [ ] Telegram bot token is valid
- [ ] Database has proper permissions

## Success Criteria

After contract approval, you should see:

1. **Database Changes:**
   - Contract status changed to 'approved'
   - Invoices created in `invoices` table
   - `approved_at` timestamp set

2. **Email Notifications:**
   - Freelancer receives congratulations email
   - Client receives invoice notification email

3. **Telegram Notifications:**
   - Freelancer receives Telegram message (if connected)

4. **Server Logs:**
   - All success messages logged
   - No error messages in logs