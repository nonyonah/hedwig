# Hedwig Payment Smart Contract

This directory contains the Solidity smart contract for the Hedwig freelancer assistant app, designed to handle invoice and payment link payments on the Base blockchain.

## Overview

The `HedwigPayment` contract enables:
- **Invoice Payments**: Clients can pay invoices generated from chat or backend
- **Payment Links**: Direct payments without prior invoice generation
- **Automatic Fee Splitting**: Platform fee (default 1.5%) + freelancer payout
- **Stablecoin Support**: Whitelisted stablecoins (USDC, USDbC on Base)
- **Event Tracking**: Comprehensive payment event logging for backend integration

## Contract Features

### Core Functionality
- ✅ `pay()` function for processing payments
- ✅ Automatic platform fee calculation and distribution
- ✅ Whitelisted stablecoin support (ERC20 `transferFrom`)
- ✅ Event emission for backend listeners
- ✅ Access control for platform management

### Admin Functions
- ✅ Token whitelist management
- ✅ Platform fee adjustment (capped at 5%)
- ✅ Platform wallet updates
- ✅ Emergency token recovery

### Security Features
- ✅ ReentrancyGuard protection
- ✅ Ownable access control
- ✅ Input validation and custom errors
- ✅ Safe ERC20 transfers

## Files Structure

```
src/contracts/
├── HedwigPayment.sol           # Main payment contract
├── HedwigPaymentDeployer.sol   # Deployment helper contract
├── HedwigPaymentService.ts     # TypeScript service class
├── types.ts                    # TypeScript interfaces
└── README.md                   # This file

src/pages/api/payment/
├── process.ts                  # Payment processing API
└── events.ts                   # Event listening API

supabase/migrations/
└── 20241220000000_add_payment_events.sql  # Database schema
```

## Deployment

### Prerequisites
1. Node.js and npm/yarn
2. Hardhat or Foundry for deployment
3. Base network RPC endpoint
4. Platform wallet address
5. Private key for deployment

### Base Chain Configuration
- **Network**: Base Mainnet
- **Chain ID**: 8453
- **RPC URL**: `https://mainnet.base.org`
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **USDbC**: `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA`

### Environment Variables
Add these to your `.env.local`:

```bash
# Contract Configuration
HEDWIG_PAYMENT_CONTRACT_ADDRESS=0x...  # Set after deployment
BASE_RPC_URL=https://mainnet.base.org
PLATFORM_PRIVATE_KEY=0x...             # Platform admin private key

# Supabase (for event storage)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### Deployment Steps

1. **Compile the contract**:
   ```bash
   npx hardhat compile
   ```

2. **Deploy to Base**:
   ```bash
   npx hardhat run scripts/deploy.js --network base
   ```

3. **Update environment variables** with the deployed contract address

4. **Run database migration**:
   ```bash
   npx supabase migration up
   ```

5. **Start event listener**:
   ```bash
   curl -X POST http://localhost:3000/api/payment/events
   ```

## Usage

### Processing Payments

```typescript
import { HedwigPaymentService } from '../contracts/HedwigPaymentService';

const paymentService = new HedwigPaymentService(
  CONTRACT_ADDRESS,
  RPC_URL,
  PRIVATE_KEY
);

const result = await paymentService.processPayment({
  token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  amount: '1000000', // 1 USDC (6 decimals)
  freelancer: '0x...',
  invoiceId: 'invoice_123'
});
```

### Listening for Events

```typescript
await paymentService.listenForPayments((event) => {
  console.log('Payment received:', {
    payer: event.payer,
    freelancer: event.freelancer,
    amount: event.amount.toString(),
    invoiceId: event.invoiceId,
    transactionHash: event.transactionHash
  });
});
```

### API Integration

**Process Payment**:
```bash
curl -X POST http://localhost:3000/api/payment/process \
  -H "Content-Type: application/json" \
  -d '{
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "1000000",
    "freelancer": "0x...",
    "invoiceId": "invoice_123"
  }'
```

**Get Payment Events**:
```bash
curl "http://localhost:3000/api/payment/events?invoiceId=invoice_123"
```

## Contract Interface

### Main Functions

```solidity
function pay(
    address token,
    uint256 amount,
    address freelancer,
    string calldata invoiceId
) external;

function isTokenWhitelisted(address token) external view returns (bool);
function calculateFee(uint256 amount) external view returns (uint256 fee, uint256 freelancerPayout);
```

### Events

```solidity
event PaymentReceived(
    address indexed payer,
    address indexed freelancer,
    address indexed token,
    uint256 amount,
    uint256 fee,
    string invoiceId
);
```

### Admin Functions

```solidity
function setTokenWhitelist(address token, bool status) external onlyOwner;
function setPlatformFee(uint256 fee) external onlyOwner;
function setPlatformWallet(address newWallet) external onlyOwner;
```

## Integration with Hedwig App

### Invoice Flow
1. User creates invoice via Telegram/WhatsApp
2. Invoice stored in Supabase with unique ID
3. Payment link generated with contract parameters
4. Client pays using whitelisted stablecoin
5. Contract emits `PaymentReceived` event
6. Backend listener updates invoice status
7. Freelancer and client receive notifications

### Payment Link Flow
1. Freelancer creates payment link
2. Link includes contract address and parameters
3. Client connects wallet and pays
4. Same event processing as invoice flow

### Event Processing
1. Contract emits `PaymentReceived` event
2. Backend listener catches event
3. Payment stored in `payment_events` table
4. Invoice/proposal status updated to 'paid'
5. Notifications sent via Telegram/WhatsApp
6. Receipt generated and sent to client

## Security Considerations

- ✅ All external calls use `nonReentrant` modifier
- ✅ Input validation prevents zero amounts and invalid addresses
- ✅ Token whitelist prevents unauthorized token usage
- ✅ Platform fee capped at 5% maximum
- ✅ Emergency recovery function for stuck tokens
- ✅ Ownable pattern for admin functions

## Gas Optimization

- ✅ Efficient fee calculation using basis points
- ✅ Minimal storage usage
- ✅ Batch operations for token whitelisting
- ✅ Custom errors instead of require strings

## Testing

Run the test suite:
```bash
npx hardhat test
```

## Support

For questions or issues:
1. Check the contract events in the Base explorer
2. Verify token allowances before payments
3. Ensure tokens are whitelisted
4. Monitor gas prices for optimal transaction timing

## License

MIT License - see LICENSE file for details.