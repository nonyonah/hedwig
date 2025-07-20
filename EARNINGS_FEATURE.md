# Earnings Summary Backend Feature

This backend feature enables the AI agent to provide comprehensive earnings summaries for users through natural language queries via WhatsApp.

## Features

- **Earnings Tracking**: Track all completed payments received by a wallet
- **Spending Tracking**: Track all payments made by a wallet
- **Natural Language Queries**: Process user questions like "How much have I earned this week?"
- **Flexible Filtering**: Filter by token, network, timeframe, or custom date ranges
- **Aggregation**: Group earnings by token and network with totals and averages
- **Payment Completion**: Mark payments as completed with transaction details

## Database Schema

### Enhanced `payment_links` Table

The existing `payment_links` table has been enhanced with:

```sql
-- New column for tracking who made the payment
ALTER TABLE payment_links ADD COLUMN payer_wallet_address TEXT;

-- Indexes for optimized earnings queries
CREATE INDEX idx_payment_links_payer_wallet ON payment_links(payer_wallet_address);
CREATE INDEX idx_payment_links_paid_at ON payment_links(paid_at);
CREATE INDEX idx_payment_links_earnings ON payment_links(wallet_address, status, paid_at);
CREATE INDEX idx_payment_links_payer_earnings ON payment_links(payer_wallet_address, status, paid_at);
```

### Earnings Summary View

A database view for simplified earnings queries:

```sql
CREATE VIEW earnings_summary AS
SELECT 
  wallet_address as recipient_wallet,
  payer_wallet_address,
  token,
  network,
  paid_amount as amount,
  paid_at as timestamp,
  status,
  transaction_hash,
  payment_reason,
  id as payment_id
FROM payment_links
WHERE status = 'paid' AND paid_at IS NOT NULL;
```

## API Endpoints

### 1. Earnings Summary API

**Endpoint**: `/api/earnings`

**Methods**: `GET`, `POST`

**Parameters**:
- `walletAddress` (required): The wallet address to get earnings for
- `token` (optional): Filter by specific token (e.g., "USDC")
- `network` (optional): Filter by specific network (e.g., "Base")
- `timeframe` (optional): Predefined timeframes
  - `last7days`: Last 7 days
  - `lastMonth`: Last 30 days
  - `last3months`: Last 3 months
  - `lastYear`: Last 365 days
  - `allTime`: All time (default)
- `startDate` (optional): Custom start date (ISO string)
- `endDate` (optional): Custom end date (ISO string)
- `type` (optional): "earnings" or "spending" (default: "earnings")
- `format` (optional): "json" or "natural" (default: "json")

**Example GET Request**:
```
GET /api/earnings?walletAddress=0x123...&timeframe=lastMonth&token=USDC&format=natural
```

**Example POST Request**:
```json
{
  "walletAddress": "0x123...",
  "timeframe": "last7days",
  "token": "USDC",
  "network": "Base",
  "format": "natural"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "walletAddress": "0x123...",
    "timeframe": "last7days",
    "totalEarnings": 150.50,
    "totalPayments": 5,
    "earnings": [
      {
        "token": "USDC",
        "network": "Base",
        "total": 150.50,
        "count": 5,
        "averageAmount": 30.10,
        "lastPayment": "2024-01-15T10:30:00Z"
      }
    ],
    "period": {
      "startDate": "2024-01-08T00:00:00Z",
      "endDate": "2024-01-15T23:59:59Z"
    }
  },
  "naturalLanguage": "You have earned a total of 150.5 tokens across 5 payments last 7 days.\n\nBreakdown by token:\n• 150.5 USDC on Base (5 payments, avg: 30.1 USDC)"
}
```

### 2. Natural Language Query API

**Endpoint**: `/api/earnings/query`

**Method**: `POST`

**Parameters**:
- `query` (required): Natural language query
- `walletAddress` (required): The wallet address

**Example Request**:
```json
{
  "query": "How much USDC have I earned on Base this month?",
  "walletAddress": "0x123..."
}
```

**Response**:
```json
{
  "success": true,
  "query": "How much USDC have I earned on Base this month?",
  "parsedFilter": {
    "walletAddress": "0x123...",
    "token": "USDC",
    "network": "Base",
    "timeframe": "lastMonth"
  },
  "type": "earnings",
  "data": { /* earnings summary data */ },
  "response": "You have earned a total of 150.5 USDC on Base across 5 payments this month."
}
```

### 3. Payment Completion API

**Endpoint**: `/api/payments/complete`

**Methods**: `GET`, `POST`

**POST Parameters**:
- `paymentLinkId` (required): The payment link ID
- `transactionHash` (required): The transaction hash
- `paidAmount` (required): The amount paid
- `payerWalletAddress` (required): The wallet that made the payment
- `blockNumber` (optional): Block number
- `gasUsed` (optional): Gas used
- `gasPrice` (optional): Gas price

**Example POST Request**:
```json
{
  "paymentLinkId": "uuid-123",
  "transactionHash": "0xabc123...",
  "paidAmount": "100.50",
  "payerWalletAddress": "0x456..."
}
```

### 4. Payment Statistics API

**Endpoint**: `/api/payments/stats`

**Method**: `GET`

**Parameters**:
- `walletAddress` (required): The wallet address
- `includeRecent` (optional): Include recent payments (default: false)
- `recentLimit` (optional): Number of recent payments to include (default: 10)

**Example Request**:
```
GET /api/payments/stats?walletAddress=0x123...&includeRecent=true&recentLimit=5
```

## Usage Examples

### For WhatsApp AI Agent

The AI agent can process natural language queries and return formatted responses:

```javascript
// Example integration in WhatsApp bot
async function handleEarningsQuery(userMessage, walletAddress) {
  const response = await fetch('/api/earnings/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: userMessage,
      walletAddress: walletAddress
    })
  });
  
  const data = await response.json();
  return data.response; // Natural language response
}

// User: "How much have I earned this week?"
// Response: "You have earned a total of 150.5 tokens across 5 payments last 7 days..."
```

### Supported Query Types

The system can understand various natural language patterns:

- **Timeframe queries**: "this week", "last month", "this year", "all time"
- **Token-specific**: "How much USDC have I earned?"
- **Network-specific**: "Show my earnings on Base"
- **Spending queries**: "How much did I spend last month?"
- **Combined filters**: "How much USDC did I earn on Polygon this year?"

### Payment Completion Integration

When a payment is completed (detected via blockchain monitoring), call the completion API:

```javascript
// Example webhook handler
async function onPaymentDetected(transactionData) {
  await fetch('/api/payments/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentLinkId: transactionData.paymentLinkId,
      transactionHash: transactionData.hash,
      paidAmount: transactionData.amount,
      payerWalletAddress: transactionData.from,
      blockNumber: transactionData.blockNumber
    })
  });
}
```

## Security Considerations

- All wallet addresses are validated for proper format
- Input sanitization for all parameters
- Rate limiting should be implemented for production
- Service role key is used for database operations
- Row Level Security (RLS) policies are in place

## Performance Optimizations

- Database indexes on frequently queried columns
- Efficient aggregation queries
- Pagination support for large datasets
- Caching can be added for frequently accessed data

## Error Handling

All APIs include comprehensive error handling with:
- Input validation
- Database error handling
- Proper HTTP status codes
- Detailed error messages for debugging

## Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Testing

Test the APIs using the provided endpoints:

1. **Test earnings summary**:
   ```bash
   curl -X GET "http://localhost:3000/api/earnings?walletAddress=0x123...&timeframe=lastMonth"
   ```

2. **Test natural language query**:
   ```bash
   curl -X POST "http://localhost:3000/api/earnings/query" \
     -H "Content-Type: application/json" \
     -d '{"query": "How much have I earned this week?", "walletAddress": "0x123..."}'
   ```

3. **Test payment completion**:
   ```bash
   curl -X POST "http://localhost:3000/api/payments/complete" \
     -H "Content-Type: application/json" \
     -d '{"paymentLinkId": "uuid", "transactionHash": "0xabc...", "paidAmount": "100", "payerWalletAddress": "0x456..."}'
   ```

This backend feature provides a complete solution for earnings tracking and natural language querying, perfect for integration with WhatsApp AI agents.