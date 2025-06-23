# Alchemy Integration for Hedwig

This document outlines the integration of Alchemy's blockchain API services with the Hedwig platform.

## Overview

The integration allows Hedwig to access on-chain data and wallet information through Alchemy's API. This enables features such as:

- Checking wallet balances (ETH and tokens)
- Retrieving recent transactions
- Validating wallet addresses
- Monitoring wallet events

## Setup

### Environment Variables

Add the following to your `.env` file:

```
ALCHEMY_API_KEY=your_alchemy_api_key_here
ALCHEMY_NETWORK=base-sepolia
```

Supported networks include:
- `eth-mainnet` - Ethereum Mainnet
- `eth-sepolia` - Ethereum Sepolia Testnet
- `base-mainnet` - Base Mainnet
- `base-sepolia` - Base Sepolia Testnet

### Installation

The integration uses Alchemy SDK and ethers.js. If not already installed, add them to your project:

```bash
npm install alchemy-sdk ethers@^6.0.0
```

## Features

### Wallet Balance Checking

The integration provides tools to check wallet balances, including:
- Native token balance (ETH)
- ERC-20 token balances

```typescript
import { getWalletBalance } from "./lib/alchemyUtils";

const balance = await getWalletBalance("0xYourWalletAddress");
console.log(`ETH Balance: ${balance.formattedBalance}`);
console.log(`Tokens: ${balance.tokens.length}`);
```

### Recent Transactions

Retrieve recent transactions for a wallet:

```typescript
import { getRecentTransactions } from "./lib/alchemyUtils";

const transactions = await getRecentTransactions("0xYourWalletAddress", 5);
console.log(`Recent transactions: ${transactions.transfers.length}`);
```

### AgentKit Integration

The Alchemy tools are integrated with AgentKit, providing the following tools:

- `check_wallet_balance` - Check a wallet's balance
- `get_recent_transactions` - Get recent transactions for a wallet
- `validate_wallet_address` - Validate if a string is a valid Ethereum address

## Architecture

The integration consists of:

1. **alchemyUtils.ts** - Core utility functions for interacting with Alchemy API
2. **alchemyAgent.ts** - AgentKit tool definitions for Alchemy functionality

## Error Handling

All functions include proper error handling and logging. Errors are caught and logged to the console, with descriptive error messages returned to the caller.

## Future Enhancements

Potential future enhancements include:
- NFT support
- Gas estimation
- Smart contract interaction
- Transaction simulation

## Troubleshooting

If you encounter issues:

1. Verify your Alchemy API key is correct
2. Ensure you're using the correct network
 