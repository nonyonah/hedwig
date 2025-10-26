# Requirements Document

## Introduction

The Contracts 2.0 system replaces Hedwig's previous on-chain smart contract escrow with an email-based approval and milestone payment flow. This system maintains integration with Hedwig's existing payment smart contract (which automatically deducts a 1% platform fee) while providing a more user-friendly contract management experience through Supabase, Telegram, and email notifications.

## Glossary

- **Hedwig_System**: The complete Hedwig freelancer payment platform
- **Contract_2.0_System**: The new email-based contract management system
- **Payment_Smart_Contract**: Existing on-chain contract that handles payments with 1% platform fee
- **Approval_Token**: Unique token used for email-based contract approval
- **Milestone**: Individual payment milestone within a contract
- **Freelancer**: User who creates contracts and receives payments
- **Client**: External party who approves contracts and makes payments
- **Supabase_Database**: Primary data storage system
- **Telegram_Bot**: Notification system for freelancers

## Requirements

### Requirement 1

**User Story:** As a freelancer, I want to create contracts with milestone-based payments, so that I can structure my work and get paid incrementally.

#### Acceptance Criteria

1. WHEN a freelancer initiates contract creation, THE Contract_2.0_System SHALL capture client name, email, project title, description, total amount, currency, part payment toggle, deadline, and milestone details
2. WHEN contract data is submitted, THE Contract_2.0_System SHALL store the contract in Supabase_Database with status 'pending_approval'
3. WHEN a contract is created, THE Contract_2.0_System SHALL generate a unique Approval_Token for email verification
4. WHEN a contract is saved, THE Contract_2.0_System SHALL send an approval email to the client containing contract summary and tokenized approval/decline URLs
5. WHEN a contract is created, THE Contract_2.0_System SHALL notify the freelancer via Telegram_Bot that the contract has been sent for approval

### Requirement 2

**User Story:** As a client, I want to approve or decline contracts via email, so that I can review and authorize work without needing to create an account.

#### Acceptance Criteria

1. WHEN a client receives an approval email, THE Contract_2.0_System SHALL display contract details including project title, description, total amount, milestones, and deadline
2. WHEN a client clicks the approve button, THE Contract_2.0_System SHALL validate the Approval_Token and update contract status to 'approved'
3. WHEN a client clicks the decline button, THE Contract_2.0_System SHALL validate the Approval_Token and update contract status to 'rejected'
4. WHEN a contract status changes to 'approved' or 'rejected', THE Contract_2.0_System SHALL notify the freelancer via Telegram_Bot
5. IF an invalid or expired Approval_Token is used, THEN THE Contract_2.0_System SHALL display an error message and prevent status changes

### Requirement 3

**User Story:** As a freelancer, I want invoices to be automatically generated for each milestone when a contract is approved, so that clients can make payments immediately.

#### Acceptance Criteria

1. WHEN a contract status changes to 'approved', THE Contract_2.0_System SHALL automatically create an invoice for each milestone
2. WHEN an invoice is created, THE Contract_2.0_System SHALL include client information, freelancer information, milestone title, amount, and payment link
3. WHEN invoices are generated, THE Contract_2.0_System SHALL link each invoice to its corresponding milestone via invoice_id
4. WHEN invoices are created, THE Contract_2.0_System SHALL integrate with the existing Payment_Smart_Contract for payment processing
5. WHEN invoice generation is complete, THE Contract_2.0_System SHALL notify both freelancer and client via their respective channels

### Requirement 4

**User Story:** As a client, I want to pay for milestones using the existing payment system, so that payments are secure and the platform fee is automatically handled.

#### Acceptance Criteria

1. WHEN a client accesses a payment link, THE Contract_2.0_System SHALL redirect to the existing Payment_Smart_Contract interface
2. WHEN a payment is completed, THE Payment_Smart_Contract SHALL automatically deduct the 1% platform fee
3. WHEN a payment webhook is received, THE Contract_2.0_System SHALL update the corresponding milestone status to 'paid'
4. WHEN a milestone is marked as paid, THE Contract_2.0_System SHALL update the contract's amount_paid field
5. WHEN a payment is confirmed, THE Contract_2.0_System SHALL send notifications to both freelancer and client

### Requirement 5

**User Story:** As a freelancer, I want to track contract progress and receive notifications, so that I can monitor payment status and project completion.

#### Acceptance Criteria

1. WHEN any contract status changes, THE Contract_2.0_System SHALL send real-time notifications to the freelancer via Telegram_Bot
2. WHEN all milestones in a contract are paid, THE Contract_2.0_System SHALL automatically update contract status to 'completed'
3. WHEN a contract is completed, THE Contract_2.0_System SHALL send a final summary notification to both parties
4. WHILE a contract is in progress, THE Contract_2.0_System SHALL maintain accurate amount_paid totals
5. WHEN milestones become overdue, THE Contract_2.0_System SHALL send reminder notifications

### Requirement 6

**User Story:** As a system administrator, I want all contract data to be stored reliably in Supabase, so that the system can scale and maintain data integrity.

#### Acceptance Criteria

1. THE Contract_2.0_System SHALL store all contract data in the contracts table with proper relationships
2. THE Contract_2.0_System SHALL store milestone data in the contract_milestones table linked to contracts
3. THE Contract_2.0_System SHALL store notification history in the contract_notifications table
4. WHEN database operations occur, THE Contract_2.0_System SHALL use proper foreign key constraints and data validation
5. THE Contract_2.0_System SHALL implement database triggers for automatic status updates and calculations

### Requirement 7

**User Story:** As a freelancer, I want to support both full and partial payments, so that I can accommodate different client payment preferences.

#### Acceptance Criteria

1. WHEN creating a contract, THE Contract_2.0_System SHALL allow freelancers to enable or disable part payments
2. WHERE part payments are enabled, THE Contract_2.0_System SHALL allow clients to pay individual milestones
3. WHERE part payments are disabled, THE Contract_2.0_System SHALL require full contract payment before marking as complete
4. WHEN part payments are made, THE Contract_2.0_System SHALL track individual milestone payment status
5. THE Contract_2.0_System SHALL calculate and display accurate payment progress regardless of payment method

### Requirement 8

**User Story:** As a client, I want to receive clear email communications about contract status, so that I stay informed about project progress and payment requirements.

#### Acceptance Criteria

1. WHEN a contract requires approval, THE Contract_2.0_System SHALL send a professional approval email with all contract details
2. WHEN invoices are generated, THE Contract_2.0_System SHALL send invoice notification emails to clients
3. WHEN payments are received, THE Contract_2.0_System SHALL send payment confirmation emails
4. WHEN contracts are completed, THE Contract_2.0_System SHALL send completion summary emails
5. THE Contract_2.0_System SHALL ensure all emails are properly formatted and contain relevant contract information