# Design Document

## Overview

The Fonbnk On-Ramp integration will enable users to purchase cryptocurrency using local fiat currencies directly through Hedwig's Telegram bot. This feature extends the existing offramp functionality by adding the reverse flow - converting fiat to crypto. The integration leverages Fonbnk's On-Ramp API, PostHog analytics, and webhook notifications to provide a seamless user experience.

The system will support purchasing USDC, USDT, and cUSD across Solana, Base, Celo, and Lisk networks, with real-time rate fetching and transaction tracking.

## Architecture

### High-Level Flow
1. **User Interaction**: User initiates purchase through Telegram bot
2. **Rate Fetching**: System fetches real-time conversion rates from Fonbnk API
3. **Transaction Creation**: User confirms purchase, system creates transaction record
4. **Payment Processing**: Fonbnk processes fiat payment and delivers crypto to user's CDP wallet
5. **Status Updates**: Webhook notifications update transaction status and notify user
6. **Analytics**: PostHog tracks user journey and conversion events

### Integration Points
- **Telegram Bot Service**: Handles user interactions and command routing
- **Fonbnk API**: Provides rates, transaction creation, and status updates
- **CDP Wallet Service**: Manages user wallet addresses for crypto delivery
- **Supabase Database**: Stores transaction records and user data
- **PostHog Analytics**: Tracks user events and conversion metrics
- **Webhook System**: Processes status updates from Fonbnk

## Components and Interfaces

### 1. Fonbnk Service (`src/lib/fonbnkService.ts`)

Primary service for interacting with Fonbnk On-Ramp API.

```typescript
interface FonbnkService {
  // Rate fetching
  getExchangeRates(token: string, amount: number, currency: string): Promise<RateResponse>
  
  // Transaction management
  createTransaction(request: OnrampRequest): Promise<TransactionResponse>
  checkTransactionStatus(transactionId: string): Promise<TransactionStatus>
  
  // Supported assets
  getSupportedTokens(): Promise<SupportedToken[]>
  getSupportedCurrencies(): Promise<SupportedCurrency[]>
}

interface OnrampRequest {
  userId: string
  token: string
  chain: string
  amount: number
  currency: string
  walletAddress: string
}
```

### 2. Telegram Bot Integration

Extends existing `TelegramBotService` with onramp commands and conversation flows.

```typescript
// New command handlers in TelegramBotService
private async handleBuyCryptoCommand(msg: TelegramBot.Message): Promise<void>
private async handleOnrampCallback(callbackQuery: TelegramBot.CallbackQuery): Promise<void>
private async handleOnrampHistory(chatId: number, userId: string): Promise<void>
private async handleOnrampStatus(chatId: number, userId: string, transactionId: string): Promise<void>
```

### 3. Database Schema Extensions

New table for onramp transactions:

```sql
CREATE TABLE onramp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  fonbnk_transaction_id VARCHAR NOT NULL UNIQUE,
  token VARCHAR NOT NULL,
  chain VARCHAR NOT NULL,
  amount DECIMAL NOT NULL,
  fiat_amount DECIMAL NOT NULL,
  fiat_currency VARCHAR NOT NULL,
  wallet_address VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  tx_hash VARCHAR,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4. Webhook Handler (`src/pages/api/webhooks/fonbnk.ts`)

Processes status updates from Fonbnk and triggers user notifications.

```typescript
interface FonbnkWebhookPayload {
  event: string
  transaction_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  amount: number
  currency: string
  tx_hash?: string
  timestamp: number
}
```

### 5. PostHog Analytics Integration

Extends existing PostHog service with onramp-specific events:

```typescript
// New events in HedwigEvents
onrampStarted: (userId: string, details: OnrampEventDetails) => Promise<void>
onrampTokenSelected: (userId: string, token: string, chain: string) => Promise<void>
onrampChainSelected: (userId: string, chain: string) => Promise<void>
onrampTransactionCreated: (userId: string, transaction: OnrampTransaction) => Promise<void>
onrampTransactionCompleted: (userId: string, transaction: OnrampTransaction) => Promise<void>
onrampTransactionFailed: (userId: string, transaction: OnrampTransaction, reason: string) => Promise<void>
```

## Data Models

### OnrampTransaction
```typescript
interface OnrampTransaction {
  id: string
  userId: string
  fonbnkTransactionId: string
  token: string
  chain: string
  amount: number
  fiatAmount: number
  fiatCurrency: string
  walletAddress: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  txHash?: string
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
}
```

### SupportedAssets
```typescript
interface SupportedToken {
  symbol: string
  name: string
  chains: string[]
  minAmount: number
  maxAmount: number
}

interface SupportedCurrency {
  code: string
  name: string
  symbol: string
  regions: string[]
}
```

### ConversationState
```typescript
interface OnrampConversationState {
  step: 'token_selection' | 'chain_selection' | 'region_selection' | 'amount_input' | 'confirmation'
  selectedToken?: string
  selectedChain?: string
  selectedCurrency?: string
  amount?: number
  rates?: Record<string, number>
}
```

## Error Handling

### Error Categories
1. **API Errors**: Fonbnk API unavailable or rate limiting
2. **Validation Errors**: Invalid token/chain combinations, amount limits
3. **Network Errors**: Blockchain network issues
4. **User Errors**: Insufficient funds, invalid input

### Error Recovery Strategies
- **Retry Logic**: Exponential backoff for API calls
- **Fallback Rates**: Cache recent rates for temporary API outages
- **Graceful Degradation**: Show cached supported assets if API unavailable
- **User Guidance**: Clear error messages with suggested actions

### Error Logging
```typescript
interface OnrampError {
  type: 'api_error' | 'validation_error' | 'network_error' | 'user_error'
  message: string
  context: {
    userId?: string
    transactionId?: string
    step?: string
    apiEndpoint?: string
  }
  timestamp: Date
}
```

## Testing Strategy

### Unit Tests
- **FonbnkService**: Mock API responses, test rate calculations
- **Validation Logic**: Test input validation and error handling
- **PostHog Integration**: Mock analytics calls, verify event tracking
- **Database Operations**: Test transaction CRUD operations

### Integration Tests
- **Webhook Processing**: Test end-to-end webhook handling
- **Telegram Bot Flow**: Test conversation state management
- **API Integration**: Test against Fonbnk sandbox environment

### End-to-End Tests
- **Complete Purchase Flow**: From bot interaction to transaction completion
- **Error Scenarios**: Test various failure modes and recovery
- **Analytics Verification**: Ensure all events are properly tracked

### Test Environment Setup
```typescript
// Test configuration
const testConfig = {
  fonbnk: {
    apiUrl: 'https://sandbox-api.fonbnk.com',
    apiKey: process.env.FONBNK_TEST_API_KEY
  },
  database: {
    url: process.env.TEST_DATABASE_URL
  },
  posthog: {
    disabled: true // Disable analytics in tests
  }
}
```

## Security Considerations

### API Security
- **API Key Management**: Store Fonbnk API keys in environment variables
- **Webhook Verification**: Verify webhook signatures from Fonbnk
- **Rate Limiting**: Implement user-level rate limiting for API calls

### Data Protection
- **PII Handling**: Minimize storage of personally identifiable information
- **Transaction Security**: Encrypt sensitive transaction data
- **Audit Logging**: Log all transaction state changes

### Input Validation
- **Amount Limits**: Enforce minimum/maximum transaction amounts
- **Token/Chain Validation**: Validate supported combinations
- **Currency Validation**: Verify supported fiat currencies

## Performance Considerations

### Caching Strategy
- **Rate Caching**: Cache exchange rates for 30 seconds to reduce API calls
- **Asset Caching**: Cache supported tokens/currencies for 1 hour
- **User State**: Use Redis for conversation state management

### Database Optimization
- **Indexing**: Index frequently queried fields (user_id, status, created_at)
- **Pagination**: Implement pagination for transaction history
- **Connection Pooling**: Use connection pooling for database operations

### API Rate Limiting
- **Request Throttling**: Implement exponential backoff for API calls
- **Batch Operations**: Group multiple rate requests when possible
- **Circuit Breaker**: Implement circuit breaker pattern for API failures

## Monitoring and Observability

### Metrics to Track
- **Transaction Volume**: Number of onramp transactions per day/week/month
- **Success Rate**: Percentage of successful transactions
- **Average Transaction Time**: Time from initiation to completion
- **Error Rates**: Frequency and types of errors
- **User Engagement**: Conversion rates from bot interaction to transaction

### Logging Strategy
```typescript
interface OnrampLogEntry {
  level: 'info' | 'warn' | 'error'
  event: string
  userId?: string
  transactionId?: string
  metadata: Record<string, any>
  timestamp: Date
}
```

### Alerting
- **High Error Rate**: Alert when error rate exceeds 5%
- **API Downtime**: Alert when Fonbnk API is unavailable
- **Transaction Delays**: Alert when transactions take longer than expected
- **Webhook Failures**: Alert when webhook processing fails

## Deployment Strategy

### Environment Configuration
```typescript
interface OnrampConfig {
  fonbnk: {
    apiUrl: string
    apiKey: string
    webhookSecret: string
  }
  features: {
    enableOnramp: boolean
    supportedTokens: string[]
    supportedChains: string[]
    supportedCurrencies: string[]
  }
  limits: {
    minTransactionAmount: number
    maxTransactionAmount: number
    dailyTransactionLimit: number
  }
}
```

### Feature Flags
- **Gradual Rollout**: Enable for subset of users initially
- **Chain-Specific Rollout**: Enable different chains progressively
- **Emergency Disable**: Quick disable capability for issues

### Database Migrations
1. Create onramp_transactions table
2. Add indexes for performance
3. Create stored procedures for common queries
4. Set up database triggers for audit logging