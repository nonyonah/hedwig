# Requirements Document

## Introduction

This feature integrates Fonbnk's On-Ramp API into Hedwig's Telegram bot to enable users to purchase cryptocurrency using local fiat currencies. The integration includes real-time conversion rates, transaction tracking, PostHog analytics, and webhook-based status notifications. Users will be able to buy supported tokens (USDC, USDT, cUSD) across multiple chains (Solana, Base, Celo, Lisk) directly through the Telegram interface.

## Requirements

### Requirement 1

**User Story:** As a Hedwig user, I want to buy cryptocurrency with fiat currency through the Telegram bot, so that I can easily convert my local currency to crypto without leaving the chat interface.

#### Acceptance Criteria

1. WHEN a user selects "Buy Crypto" in the Telegram bot THEN the system SHALL present token options (USDC, USDT, cUSD)
2. WHEN a user selects a token THEN the system SHALL present available network options (Solana, Base, Celo, Lisk) based on token compatibility
3. WHEN a user selects a network THEN the system SHALL prompt for region/currency selection (NGN, GHS, etc.)
4. WHEN a user provides purchase amount THEN the system SHALL fetch and display real-time conversion rates via Fonbnk API
5. WHEN a user confirms the purchase THEN the system SHALL create a transaction using the user's CDP Server wallet address

### Requirement 2

**User Story:** As a Hedwig user, I want to track my on-ramp transaction history, so that I can monitor my purchase activity and transaction status.

#### Acceptance Criteria

1. WHEN a transaction is created THEN the system SHALL store transaction details (id, user_id, amount, chain, status, timestamp) in Supabase
2. WHEN a user requests transaction history THEN the system SHALL display their on-ramp transactions with status and timestamps
3. WHEN a user requests specific transaction status THEN the system SHALL provide current status and estimated completion time
4. WHEN a transaction status changes THEN the system SHALL update the stored record in real-time

### Requirement 3

**User Story:** As a Hedwig user, I want to receive real-time notifications about my transaction status, so that I know when my purchase is processing, completed, or failed.

#### Acceptance Criteria

1. WHEN Fonbnk sends a webhook notification THEN the system SHALL match the transaction_id with the user in Supabase
2. WHEN a transaction status is "completed" THEN the system SHALL send a success message to the user via Telegram
3. WHEN a transaction status is "processing" THEN the system SHALL send a processing update to the user via Telegram
4. WHEN a transaction status is "failed" THEN the system SHALL send a failure notification with refund information to the user via Telegram
5. WHEN creating a transaction THEN the system SHALL inform users that transfers typically complete within 1-5 minutes

### Requirement 4

**User Story:** As a product manager, I want to track user engagement with the on-ramp feature through PostHog analytics, so that I can measure feature adoption and optimize the user experience.

#### Acceptance Criteria

1. WHEN a user starts the on-ramp flow THEN the system SHALL track "onramp_started" event in PostHog
2. WHEN a user selects a token THEN the system SHALL track "onramp_token_selected" event with token metadata
3. WHEN a user selects a chain THEN the system SHALL track "onramp_chain_selected" event with chain metadata
4. WHEN a transaction is created THEN the system SHALL track "onramp_transaction_created" event with amount, chain, token, and region metadata
5. WHEN a transaction completes successfully THEN the system SHALL track "onramp_transaction_completed" event
6. WHEN a transaction fails THEN the system SHALL track "onramp_transaction_failed" event with failure reason
7. WHEN tracking events THEN the system SHALL identify users by their Telegram user ID

### Requirement 5

**User Story:** As a developer, I want the system to handle API errors gracefully and provide appropriate fallbacks, so that users have a smooth experience even when external services are unavailable.

#### Acceptance Criteria

1. WHEN Fonbnk API is unavailable THEN the system SHALL display an appropriate error message and suggest trying again later
2. WHEN rate fetching fails THEN the system SHALL retry up to 3 times before showing an error
3. WHEN webhook delivery fails THEN the system SHALL implement retry logic with exponential backoff
4. WHEN PostHog tracking fails THEN the system SHALL log the error but continue with the transaction flow
5. WHEN database operations fail THEN the system SHALL provide appropriate error messages and maintain data consistency

### Requirement 6

**User Story:** As a system administrator, I want comprehensive logging and monitoring of the on-ramp integration, so that I can troubleshoot issues and monitor system health.

#### Acceptance Criteria

1. WHEN any API call is made to Fonbnk THEN the system SHALL log request and response details
2. WHEN webhook events are received THEN the system SHALL log the event details and processing status
3. WHEN errors occur THEN the system SHALL log detailed error information including stack traces
4. WHEN transactions are processed THEN the system SHALL maintain audit logs of all state changes
5. WHEN the system starts THEN the system SHALL validate all required environment variables and API credentials