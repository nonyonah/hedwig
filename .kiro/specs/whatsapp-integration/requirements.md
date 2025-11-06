# Requirements Document

## Introduction

This document outlines the requirements for integrating WhatsApp as a new front-end interface for the Hedwig AI assistant, enabling users to interact with the same backend services and wallet functionality through both Telegram and WhatsApp platforms.

## Glossary

- **Hedwig_System**: The AI assistant platform that handles invoicing, payments, contracts, and wallet management
- **WhatsApp_Cloud_API**: Meta's official WhatsApp Business Cloud API for sending and receiving messages
- **Telegram_Bot**: The existing Telegram bot interface for Hedwig
- **Unified_Backend**: The shared backend system that processes messages from both platforms
- **Platform_Router**: The component that detects and routes messages based on their source platform
- **User_Record**: The database record containing user information, wallet address, and platform associations
- **CDP_Server_Wallets**: Coinbase Developer Platform service for wallet creation and management
- **Message_Handler**: The component that processes incoming messages and generates AI responses

## Requirements

### Requirement 1

**User Story:** As a user, I want to interact with Hedwig through WhatsApp, so that I can access all AI assistant features using my preferred messaging platform.

#### Acceptance Criteria

1. WHEN a user sends a message to the WhatsApp business number, THE Hedwig_System SHALL receive and process the message through the WhatsApp_Cloud_API
2. THE Hedwig_System SHALL respond to WhatsApp messages with the same AI functionality available on Telegram_Bot
3. THE Hedwig_System SHALL support all existing features including invoice creation, payment links, contracts, and wallet operations through WhatsApp
4. THE Hedwig_System SHALL maintain conversation context across WhatsApp message exchanges
5. THE Hedwig_System SHALL handle WhatsApp message formatting and media types appropriately

### Requirement 2

**User Story:** As a user with existing Telegram account, I want to use the same wallet and data when switching to WhatsApp, so that I have a unified experience across platforms.

#### Acceptance Criteria

1. WHEN a user provides their email address on WhatsApp, THE Hedwig_System SHALL check for existing User_Record with matching email
2. IF an existing User_Record is found, THEN THE Hedwig_System SHALL link the WhatsApp phone number to the existing wallet address
3. IF no existing User_Record is found, THEN THE Hedwig_System SHALL create a new wallet using CDP_Server_Wallets
4. THE Hedwig_System SHALL store both platform identifiers (Telegram user ID and WhatsApp phone number) in the same User_Record
5. THE Hedwig_System SHALL provide access to the same invoices, contracts, and payment history regardless of platform used

### Requirement 3

**User Story:** As a developer, I want a unified message processing system, so that both Telegram and WhatsApp messages are handled consistently.

#### Acceptance Criteria

1. THE Platform_Router SHALL detect incoming message platform by analyzing payload structure
2. WHEN payload contains "entry" field, THE Platform_Router SHALL identify the message as WhatsApp origin
3. WHEN payload contains "message.from.id" field, THE Platform_Router SHALL identify the message as Telegram origin
4. THE Message_Handler SHALL process messages from both platforms using the same AI logic and function handlers
5. THE Unified_Backend SHALL route processed responses back to the appropriate platform API

### Requirement 4

**User Story:** As a system administrator, I want proper WhatsApp Cloud API integration, so that the system can send and receive messages reliably.

#### Acceptance Criteria

1. THE Hedwig_System SHALL authenticate with WhatsApp_Cloud_API using valid access tokens
2. THE Hedwig_System SHALL verify incoming webhook requests using META_VERIFY_TOKEN
3. THE Hedwig_System SHALL send messages through the WhatsApp_Cloud_API messages endpoint
4. THE Hedwig_System SHALL handle WhatsApp API rate limits and error responses appropriately
5. THE Hedwig_System SHALL log all WhatsApp API interactions for debugging and monitoring

### Requirement 5

**User Story:** As a user, I want my activities tracked consistently, so that analytics and insights work across both platforms.

#### Acceptance Criteria

1. THE Hedwig_System SHALL track user actions on WhatsApp using the same Posthog events as Telegram_Bot
2. THE Hedwig_System SHALL include platform identifier in all analytics events
3. THE Hedwig_System SHALL maintain user session tracking across WhatsApp conversations
4. THE Hedwig_System SHALL record platform-specific metrics for performance monitoring
5. THE Hedwig_System SHALL ensure user privacy compliance for both platforms

### Requirement 6

**User Story:** As a user, I want secure authentication through WhatsApp, so that my wallet and financial data remain protected.

#### Acceptance Criteria

1. THE Hedwig_System SHALL use WhatsApp verified phone numbers as primary identity proof
2. THE Hedwig_System SHALL validate webhook authenticity using Meta verification tokens
3. THE Hedwig_System SHALL encrypt sensitive user data in database storage
4. THE Hedwig_System SHALL implement rate limiting for WhatsApp message processing
5. THE Hedwig_System SHALL log security events for audit purposes

### Requirement 7

**User Story:** As a user, I want seamless onboarding through WhatsApp, so that I can quickly start using Hedwig's features.

#### Acceptance Criteria

1. WHEN a user sends their first message, THE Hedwig_System SHALL provide a welcome message explaining available features
2. THE Hedwig_System SHALL request email address for account linking during initial setup
3. THE Hedwig_System SHALL guide users through wallet creation or linking process
4. THE Hedwig_System SHALL provide help commands and feature explanations through WhatsApp
5. THE Hedwig_System SHALL confirm successful setup and provide next steps to the user