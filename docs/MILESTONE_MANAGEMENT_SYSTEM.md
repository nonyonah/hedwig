# Milestone Management System

## Overview

The Milestone Management System provides comprehensive tracking and management of project milestones with automated notifications, client approval workflows, and progress tracking.

## Features

### 1. Milestone Lifecycle Management
- **Pending** → **In Progress** → **Completed** → **Approved**
- Freelancers can start, work on, and submit milestones
- Clients can review, approve, or request changes
- Automatic status transitions with notifications

### 2. Due Date Monitoring
- Automated daily checks for due/overdue milestones
- Email and Telegram notifications for freelancers and clients
- Visual indicators for due soon/overdue milestones

### 3. Enhanced UI Components
- Progress bars showing completion percentage
- Interactive milestone cards with action buttons
- Inline forms for submission and feedback
- Real-time status updates

### 4. Notification System
- Email notifications for all milestone events
- Telegram notifications for freelancers
- Client notifications for reviews and approvals
- Automated reminder system

## API Endpoints

### Milestone Actions

#### Start Milestone
```
POST /api/milestones/[id]/start
```
**Body:**
```json
{
  "freelancer_id": "uuid"
}
```

#### Submit Milestone
```
POST /api/milestones/[id]/submit
```
**Body:**
```json
{
  "deliverables": "Description of completed work",
  "completion_notes": "Additional notes about the work",
  "freelancer_id": "uuid"
}
```

#### Approve Milestone
```
POST /api/milestones/[id]/approve
```
**Body:**
```json
{
  "approval_feedback": "Great work! Approved.",
  "client_id": "uuid"
}
```

#### Request Changes
```
POST /api/milestones/[id]/request-changes
```
**Body:**
```json
{
  "changes_requested": "Please update the color scheme",
  "client_feedback": "Additional feedback",
  "client_id": "uuid"
}
```

### Monitoring

#### Milestone Notifications
```
POST /api/monitoring/milestone-notifications
```
Checks for due/overdue milestones and sends notifications.

#### Health Check
```
GET /api/health
```
Returns system health status and milestone statistics.

## Database Schema

### Enhanced contract_milestones Table

```sql
-- New fields added for milestone management
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS deliverables TEXT;
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS completion_notes TEXT;
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS changes_requested TEXT;
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS client_feedback TEXT;
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS approval_feedback TEXT;
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contract_milestones ADD COLUMN IF NOT EXISTS changes_requested_at TIMESTAMP WITH TIME ZONE;

-- Status enum with all states
CREATE TYPE milestone_status AS ENUM ('pending', 'in_progress', 'completed', 'approved');
```

### milestone_notifications Table

```sql
CREATE TABLE milestone_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    milestone_id UUID NOT NULL,
    contract_id UUID NOT NULL,
    notification_type VARCHAR(50) NOT NULL, -- 'due_soon', 'overdue', 'completed', 'approved'
    recipient_type VARCHAR(20) NOT NULL, -- 'freelancer', 'client', 'both'
    freelancer_email VARCHAR(255),
    client_email VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Workflow Examples

### Freelancer Workflow

1. **Start Milestone**
   ```bash
   curl -X POST /api/milestones/123/start \
     -H "Content-Type: application/json" \
     -d '{"freelancer_id": "freelancer-uuid"}'
   ```

2. **Submit Work**
   ```bash
   curl -X POST /api/milestones/123/submit \
     -H "Content-Type: application/json" \
     -d '{
       "deliverables": "Completed website design with responsive layout",
       "completion_notes": "All requirements met, tested on mobile and desktop"
     }'
   ```

### Client Workflow

1. **Approve Milestone**
   ```bash
   curl -X POST /api/milestones/123/approve \
     -H "Content-Type: application/json" \
     -d '{"approval_feedback": "Excellent work! Approved for payment."}'
   ```

2. **Request Changes**
   ```bash
   curl -X POST /api/milestones/123/request-changes \
     -H "Content-Type: application/json" \
     -d '{
       "changes_requested": "Please update the header color to match our brand",
       "client_feedback": "Overall good work, just needs this small adjustment"
     }'
   ```

## UI Components

### MilestoneProgress Component

Enhanced component with interactive features:

```tsx
<MilestoneProgress
  milestones={milestones}
  totalAmount={contract.total_amount}
  currency={currency}
  isFreelancer={isFreelancer}
  isClient={isClient}
  contractId={contract.id}
  onMilestoneAction={handleMilestoneAction}
/>
```

**Features:**
- Progress bar showing completion percentage
- Individual milestone cards with status indicators
- Action buttons for freelancers and clients
- Inline forms for submissions and feedback
- Due date warnings and overdue indicators

## Notification Templates

### Email Notifications

1. **Milestone Due Soon** - Sent to freelancers 3 days before due date
2. **Milestone Overdue** - Sent to freelancers and clients when overdue
3. **Milestone Submitted** - Sent to clients when freelancer submits work
4. **Milestone Approved** - Sent to freelancers when client approves
5. **Changes Requested** - Sent to freelancers when client requests changes

### Telegram Notifications

Freelancers receive Telegram notifications for:
- Milestone due reminders
- Approval confirmations
- Change requests
- Payment notifications

## Automated Monitoring

### Cron Job Setup

```bash
# Run the setup script
chmod +x scripts/setup-milestone-monitoring-cron.sh
./scripts/setup-milestone-monitoring-cron.sh
```

This sets up a daily cron job at 9 AM to check for due/overdue milestones.

### Manual Monitoring

```bash
# Test milestone notifications
curl -X POST /api/test-milestone-notifications \
  -H "Content-Type: application/json" \
  -d '{"action": "check_due_milestones"}'
```

## Testing

### Test Milestone Submission

```bash
curl -X POST /api/test-milestone-notifications \
  -H "Content-Type: application/json" \
  -d '{
    "action": "test_milestone_submit",
    "milestoneId": "milestone-uuid",
    "deliverables": "Test deliverables",
    "completion_notes": "Test completion notes"
  }'
```

### Test Milestone Approval

```bash
curl -X POST /api/test-milestone-notifications \
  -H "Content-Type: application/json" \
  -d '{
    "action": "test_milestone_approve",
    "milestoneId": "milestone-uuid",
    "approval_feedback": "Test approval feedback"
  }'
```

## Configuration

### Environment Variables

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your-bot-token

# Application URL
NEXT_PUBLIC_APP_URL=https://hedwigbot.xyz
```

### Database Migration

Run the migration to add enhanced milestone fields:

```sql
-- Apply the migration
\i supabase/migrations/20240101000014_enhance_milestone_fields.sql

-- Create notifications table
\i supabase/migrations/20240101000013_create_milestone_notifications_table.sql
```

## Monitoring and Health Checks

### Health Check Endpoint

```bash
curl /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-10-29T19:00:00.000Z",
  "services": {
    "database": "up",
    "email": "up",
    "telegram": "up"
  },
  "stats": {
    "total_contracts": 25,
    "active_contracts": 12,
    "total_milestones": 48,
    "pending_milestones": 8,
    "overdue_milestones": 2
  }
}
```

## Troubleshooting

### Common Issues

1. **Milestone notifications not sending**
   - Check email configuration
   - Verify Telegram bot token
   - Check cron job logs: `tail -f /var/log/hedwig-milestone-monitoring.log`

2. **Database migration errors**
   - Ensure proper permissions
   - Check for existing enum types
   - Run migrations in order

3. **UI not updating**
   - Check API responses in browser dev tools
   - Verify milestone action handlers
   - Refresh page to reload data

### Logs and Debugging

```bash
# View cron job logs
tail -f /var/log/hedwig-milestone-monitoring.log

# Test API endpoints
curl -X GET /api/health

# Check database connection
curl -X GET /api/debug/milestones?contractId=your-contract-id
```

## Status: ✅ IMPLEMENTED

The milestone management system is fully implemented with:
- ✅ Enhanced database schema
- ✅ Complete API endpoints
- ✅ Interactive UI components
- ✅ Automated notifications
- ✅ Due date monitoring
- ✅ Client approval workflow
- ✅ Comprehensive testing tools