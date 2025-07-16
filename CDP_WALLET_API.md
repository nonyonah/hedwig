# Coinbase CDP Wallet API Implementation

This document describes the implementation of the Coinbase Developer Platform (CDP) Wallet API v2 for wallet creation and transfers.

## Overview

The CDP Wallet API v2 provides secure wallet management with the following features:

- Secure private key management in a Trusted Execution Environment (TEE)
- Single secret authentication for all accounts
- Multi-network support (EVM and Solana)
- EIP-4337 smart account compatibility (with gas sponsorship and transaction batching)
- `viem` compatibility for EVM accounts

## Implementation Files

- **`src/lib/cdp.ts`** - Main CDP wallet API implementation
- **`src/examples/cdp-wallet-usage.ts`** - Usage examples
- **`scripts/test-cdp.js`** - Test script for wallet creation
- **`scripts/test-cdp-transfer.js`** - Test script for transfers

## Features Implemented

- ✅ Wallet creation on EVM networks (Ethereum, Base, Optimism, Arbitrum)
- ✅ Wallet creation on Solana networks
- ✅ Native token transfers (ETH, SOL)
- ✅ Token transfers (ERC-20, SPL)
- ✅ Balance checking
- ✅ Transaction recording

## Usage Examples

### Creating a Wallet

```typescript
import { createWallet } from '../lib/cdp';

// Create wallet for a user on Base Sepolia testnet
const wallet = await createWallet('user-123', 'base-sepolia');

console.log('Created wallet:', wallet);
// {
//   id: '123',
//   user_id: 'user-123',
//   address: '0x...',
//   cdp_wallet_id: 'cdp-123',
//   chain: 'evm',
//   wallet_secret: '...',
// }
```

### Checking Balances

```typescript
import { getBalances } from '../lib/cdp';

// Check balances on Base Sepolia testnet
const balances = await getBalances('0x...', 'base-sepolia');

console.log('Wallet balances:', balances);
// [
//   {
//     asset: { symbol: 'ETH', decimals: 18, ... },
//     balance: '1000000000000000000',
//     ...
//   },
//   ...
// ]
```

### Transferring Native Tokens (ETH, SOL)

```typescript
import { transferNativeToken } from '../lib/cdp';

// Transfer 0.01 ETH on Base Sepolia testnet
const result = await transferNativeToken(
  '0x...', // from address
  '0x...', // to address
  '0.01',   // amount in ETH
  'base-sepolia' // network
);

console.log('Transfer result:', result);
// { hash: '0x...' }
```

### Transferring Tokens (ERC-20, SPL)

```typescript
import { transferToken } from '../lib/cdp';

// Transfer 10 tokens on Base Sepolia testnet
const result = await transferToken(
  '0x...', // from address
  '0x...', // to address
  '0x...', // token contract address
  '10',     // amount in token units
  18,       // token decimals
  'base-sepolia' // network
);

console.log('Token transfer result:', result);
// { hash: '0x...' }
```

## Supported Networks

| Network | Chain ID | Type | Environment |
|---------|----------|------|-------------|
| ethereum-sepolia | 11155111 | EVM | Testnet |
| base-sepolia | 84532 | EVM | Testnet |
| ethereum | 1 | EVM | Mainnet |
| base | 8453 | EVM | Mainnet |
| optimism | 10 | EVM | Mainnet |
| arbitrum | 42161 | EVM | Mainnet |
| solana-devnet | devnet | Solana | Testnet |
| solana | mainnet-beta | Solana | Mainnet |

## Testing

### Test Wallet Creation

```bash
npm run test-cdp
```

### Test Transfers

```bash
npm run test-cdp-transfer
```

If you already have funded wallets, you can specify the source and destination addresses:

```bash
node scripts/test-cdp-transfer.js 0x... 0x...
```

## Environment Variables

The following environment variables are required:

```
CDP_API_KEY_ID=your_api_key_id
CDP_API_KEY_SECRET=your_api_key_secret
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Database Schema

The implementation uses the following tables in Supabase:

### wallets

- `id`: UUID (primary key)
- `user_id`: UUID (foreign key to users table)
- `address`: String (wallet address)
- `cdp_wallet_id`: String (CDP wallet ID)
- `chain`: String (evm or solana)
- `wallet_secret`: String (encrypted wallet secret)

### transactions

- `id`: UUID (primary key)
- `from_address`: String (sender address)
- `to_address`: String (recipient address)
- `amount`: String (transaction amount)
- `tx_hash`: String (transaction hash)
- `network`: String (network name)
- `token_address`: String (optional, token contract address)
- `status`: String (transaction status)

## Security Considerations

- Wallet secrets are stored securely in the database
- Private keys are managed by CDP in a Trusted Execution Environment (TEE)
- API keys should be kept secure and never exposed to clients
- All sensitive operations should be performed server-side

## References

- [Coinbase CDP Wallet API v2 Documentation](https://docs.cdp.coinbase.com/wallet-api/v2/introduction/welcome)
- [CDP SDK GitHub Repository](https://github.com/coinbase/cdp-sdk)