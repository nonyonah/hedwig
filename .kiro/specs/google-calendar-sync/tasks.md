# Implementation Plan

- [x] 1. Set up database schema and environment configuration
  - Create database migration for google_calendar_credentials table
  - Add calendar_event_id column to invoices table
  - Configure Google OAuth2 environment variables in envConfig.ts
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Implement OAuth2 callback API endpoint
  - [x] 2.1 Create /api/calendar/oauth/callback endpoint
    - Handle OAuth2 authorization code exchange
    - Parse state parameter for user identification
    - Store credentials using GoogleCalendarService
    - Send success/failure response to Telegram bot
    - _Requirements: 1.2, 1.3_

  - [x] 2.2 Implement OAuth2 state management
    - Generate secure state tokens with user context
    - Validate state tokens in callback handler
    - Handle expired or invalid state scenarios
    - _Requirements: 1.1, 1.2_

- [x] 3. Enhance Telegram bot with calendar commands
  - [x] 3.1 Add calendar command handlers to TelegramBotService
    - Implement /connect_calendar command handler
    - Implement /disconnect_calendar command handler
    - Implement /calendar_status command handler
    - Add command routing in handleCommand method
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 3.2 Create calendar command callback handlers
    - Handle calendar connection confirmation callbacks
    - Implement user-friendly error messages for calendar operations
    - Add inline keyboard options for calendar management
    - _Requirements: 4.4, 4.5_

- [x] 4. Integrate calendar sync with invoice lifecycle
  - [x] 4.1 Add calendar hooks to InvoiceModule.completeInvoiceCreation
    - Check if user has connected calendar
    - Call GoogleCalendarService.createInvoiceEvent after invoice creation
    - Store calendar_event_id in invoice record
    - Handle calendar creation failures gracefully
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 4.2 Implement invoice status change calendar updates
    - Add calendar update hook to invoice payment processing
    - Call GoogleCalendarService.markInvoiceAsPaid when invoice is paid
    - Update calendar event title and description for paid invoices
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 4.3 Add calendar cleanup for invoice deletion
    - Call GoogleCalendarService.deleteInvoiceEvent when invoice is deleted
    - Handle cases where calendar event no longer exists
    - Clean up orphaned calendar event references
    - _Requirements: 3.3, 3.4_

- [x] 5. Enhance GoogleCalendarService error handling
  - [x] 5.1 Implement comprehensive error handling
    - Add retry logic with exponential backoff for API calls
    - Implement graceful degradation when calendar operations fail
    - Add detailed error logging with user context
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.2 Improve token refresh mechanism
    - Add automatic token refresh on 401 errors
    - Implement token refresh failure handling
    - Add user notification for reconnection requirements
    - _Requirements: 1.3, 6.2_

- [x] 6. Add PostHog analytics tracking
  - [x] 6.1 Implement calendar analytics events
    - Track calendar_connected events in connect command handler
    - Track calendar_event_created events in invoice creation
    - Track calendar_event_updated events in status changes
    - Track calendar_event_deleted events in invoice deletion
    - Track calendar_disconnected events in disconnect handler
    - _Requirements: 6.4_

  - [ ]* 6.2 Add analytics dashboard metrics
    - Create PostHog dashboard for calendar feature adoption
    - Set up alerts for calendar operation failure rates
    - Monitor calendar connection success rates
    - _Requirements: 6.4_

- [x] 7. Implement comprehensive error handling and user experience
  - [x] 7.1 Add user-friendly error messages
    - Create error message templates for common calendar failures
    - Implement fallback messaging when calendar operations fail
    - Add help text for troubleshooting calendar connection issues
    - _Requirements: 4.5, 6.1, 6.2_

  - [x] 7.2 Implement calendar feature discovery
    - Add calendar sync information to invoice creation flow
    - Show calendar connection status in user profile/settings
    - Provide calendar sync benefits messaging to encourage adoption
    - _Requirements: 7.5_

- [ ]* 8. Add comprehensive testing coverage
  - [ ]* 8.1 Write unit tests for GoogleCalendarService methods
    - Test OAuth2 flow methods
    - Test calendar event CRUD operations
    - Test error handling scenarios
    - Test token refresh mechanisms
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 8.2 Write integration tests for calendar sync flow
    - Test end-to-end invoice creation with calendar sync
    - Test invoice status changes with calendar updates
    - Test calendar disconnection and reconnection flows
    - Test error recovery scenarios
    - _Requirements: 2.1, 3.1, 3.3_

- [x] 9. Add database indexes and performance optimizations
  - [x] 9.1 Create database indexes for calendar operations
    - Add index on google_calendar_credentials.user_id
    - Add index on invoices.calendar_event_id
    - Add composite index for calendar credential lookups
    - _Requirements: 5.1, 5.2_

  - [x] 9.2 Implement calendar operation performance optimizations
    - Add connection pooling for Google Calendar API calls
    - Implement caching for frequently accessed calendar credentials
    - Add timeout handling for calendar API operations
    - _Requirements: 6.1, 6.3_

- [x] 10. Final integration and deployment preparation
  - [x] 10.1 Update environment configuration and documentation
    - Add Google OAuth2 configuration to environment setup
    - Update deployment documentation with calendar feature requirements
    - Add feature flag configuration for gradual rollout
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 10.2 Implement feature flag controls
    - Add calendar feature toggle in environment configuration
    - Implement graceful feature disabling when flag is off
    - Add admin controls for enabling/disabling calendar sync per user
    - _Requirements: 7.5_