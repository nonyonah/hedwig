# Multi-Network Payment System Guide

## Overview

The Hedwig payment system now supports multiple blockchain networks simultaneously, ensuring that the correct smart contracts are called for Base and Celo networks when clients pay for invoices or payment links.

## Architecture

### Core Components

1. **MultiNetworkPaymentService** - Central service managing payment processing across multiple networks
2. **HedwigPaymentService** - Individual network payment service instances
3. **Network-specific configurations** - Contract addresses, RPC URLs, and token addresses for each network

### Supported Networks

#### Base Network (Chain ID: 8453)
- **Contract Address**: `HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE`
- **RPC URL**: `BASE_RPC_URL`
- **Platform Wallet**: `HEDWIG_PLATFORM_WALLET_BASE`
- **Supported Tokens**:
  - USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - USDT: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb`
  - USDbC: `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA`

#### Celo Network (Chain ID: 42220)
- **Contract Address**: `HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO`
- **RPC URL**: `CELO_RPC_URL`
- **Platform Wallet**: `HEDWIG_PLATFORM_WALLET_CELO`
- **Supported Tokens**:
  - cUSD: `0x765DE816845861e75A25fCA122bb6898B8B1282a`
  - USDC: `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`
  - USDT: `0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e`
  - CELO: `0x471EcE3750Da237f93B8E339c536989b8978a438`

## How It Works

### 1. Payment Event Listening

The system listens for payment events on all configured networks simultaneously:

```typescript
// Each network has its own payment service instance
const baseService = new HedwigPaymentService(baseContractAddress, baseRpcUrl);
const celoService = new HedwigPaymentService(celoContractAddress, celoRpcUrl);

// Both services listen for payments concurrently
await baseService.listenForPayments(handleBasePayment);
await celoService.listenForPayments(handleCeloPayment);
```

### 2. Network Detection

When a payment event is received, the system automatically detects which network it came from:

- **By Contract Address**: Each network has a unique smart contract address
- **By Chain ID**: Events include the chain ID (8453 for Base, 42220 for Celo)
- **By RPC Source**: Events are received from network-specific RPC endpoints

### 3. Payment Processing

Each payment is processed with full network context:

```typescript
// Payment event includes network information
const paymentEvent = {
  transactionHash: "0x...",
  invoiceId: "invoice_123",
  amount: 1000000, // 1 USDC (6 decimals)
  network: "base", // or "celo"
  chainId: 8453,   // or 42220
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // USDC on Base
};
```

### 4. Database Updates

All payment records are updated with network information:

- **payment_events** table includes `network` and `chain_id` columns
- **invoices**, **proposals**, and **payment_links** tables track which network the payment was made on
- Unique constraints ensure no duplicate processing across networks

## Environment Configuration

### Required Environment Variables

```bash
# Base Network
HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE="0xYourBaseContractAddress"
BASE_RPC_URL="https://mainnet.base.org"
HEDWIG_PLATFORM_WALLET_BASE="0xYourBasePlatformWallet"

# Celo Network
HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO="0xYourCeloContractAddress"
CELO_RPC_URL="https://forno.celo.org"
HEDWIG_PLATFORM_WALLET_CELO="0xYourCeloPlatformWallet"

# Fallback (for backward compatibility)
HEDWIG_PAYMENT_CONTRACT_ADDRESS="0xYourBaseContractAddress"
HEDWIG_PLATFORM_WALLET_MAINNET="0xYourBasePlatformWallet"
```

### Database Migration

Run the provided SQL migration to add network support:

```sql
-- Add network columns
ALTER TABLE payment_events ADD COLUMN network VARCHAR(50);
ALTER TABLE payment_events ADD COLUMN chain_id INTEGER;

-- Update unique constraints
ALTER TABLE payment_events 
ADD CONSTRAINT payment_events_transaction_hash_invoice_id_network_key 
UNIQUE (transaction_hash, invoice_id, network);
```

## Key Features

### 1. Automatic Network Detection
- Payments are automatically routed to the correct network handler
- No manual network selection required for payment processing

### 2. Token Address Resolution
- Correct token addresses are automatically selected based on network
- Supports different token standards across networks (ERC-20 on Base/Celo)

### 3. Concurrent Processing
- Multiple networks are monitored simultaneously
- No performance impact from supporting multiple networks

### 4. Error Handling
- Network-specific error handling and retry logic
- Graceful fallback for unsupported networks

### 5. Backward Compatibility
- Existing single-network configurations continue to work
- Gradual migration path to multi-network setup

## Usage Examples

### Creating a Payment Link

```typescript
// Payment link works on any supported network
const paymentLink = {
  amount: 100,
  currency: "USDC",
  // Network is determined by the payer's wallet/choice
  supportedNetworks: ["base", "celo"]
};
```

### Processing Invoice Payment

```typescript
// Invoice payment is processed regardless of network
const invoice = {
  id: "invoice_123",
  amount: 500,
  currency: "USDC",
  // Payment can come from Base or Celo
  acceptedNetworks: ["base", "celo"]
};
```

### Checking Payment Status

```typescript
// Payment status includes network information
const paymentStatus = {
  status: "paid",
  transactionHash: "0x...",
  network: "base",
  chainId: 8453,
  amount: 100,
  currency: "USDC"
};
```

## Benefits

### 1. Network Flexibility
- Users can pay from their preferred network
- Supports different token ecosystems (Base DeFi, Celo mobile payments)

### 2. Cost Optimization
- Users can choose networks with lower transaction fees
- Celo offers mobile-friendly payment options

### 3. Reliability
- Multiple network support reduces single points of failure
- Redundancy across different blockchain infrastructures

### 4. Scalability
- Easy to add new networks by extending the configuration
- Modular architecture supports future blockchain integrations

## Monitoring and Debugging

### Payment Event Logs

```bash
# Base network payment
💰 Payment received on base: { invoiceId: "invoice_123", amount: "1000000", transactionHash: "0x..." }

# Celo network payment  
💰 Payment received on celo: { invoiceId: "invoice_456", amount: "500000000000000000", transactionHash: "0x..." }
```

### Status Endpoint

Check the status of all network services:

```typescript
GET /api/payment/status

{
  "isListening": true,
  "networks": {
    "base": {
      "contractAddress": "0x...",
      "chainId": 8453,
      "isInitialized": true
    },
    "celo": {
      "contractAddress": "0x...",
      "chainId": 42220,
      "isInitialized": true
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Missing Contract Address**
   - Ensure `HEDWIG_PAYMENT_CONTRACT_ADDRESS_[NETWORK]` is set
   - Check that the contract is deployed on the target network

2. **RPC Connection Issues**
   - Verify RPC URLs are accessible
   - Check for rate limiting or authentication issues

3. **Token Address Mismatch**
   - Confirm token addresses match the deployed contracts
   - Verify token decimals are correctly configured

4. **Database Constraint Errors**
   - Run the network support migration
   - Check for duplicate payment events across networks

### Debug Commands

```bash
# Check network configuration
npm run debug:networks

# Test contract connectivity
npm run test:contracts

# Verify token addresses
npm run verify:tokens
```

## Future Enhancements

### Planned Features

1. **Additional Networks**
   - Ethereum mainnet support
   - Polygon integration
   - Arbitrum compatibility

2. **Cross-Network Payments**
   - Bridge integration for cross-network transfers
   - Automatic network selection based on fees

3. **Advanced Monitoring**
   - Network health monitoring
   - Performance metrics per network
   - Automatic failover capabilities

4. **Enhanced Token Support**
   - Native token payments (ETH, CELO)
   - Stablecoin aggregation across networks
   - DeFi token integration

## Security Considerations

### Smart Contract Security
- Each network uses independently audited contracts
- Platform fees and addresses are network-specific
- Token whitelisting prevents unauthorized payments

### Private Key Management
- Network-specific private keys for transaction signing
- Secure key storage and rotation procedures
- Multi-signature wallet support for platform operations

### Network Validation
- Transaction verification on each network
- Block confirmation requirements per network
- Replay attack prevention across networks

## Conclusion

The multi-network payment system ensures that Hedwig can process payments efficiently across Base and Celo networks, with the correct smart contracts being called for each network. This provides users with flexibility, reduces costs, and improves the overall payment experience while maintaining security and reliability.