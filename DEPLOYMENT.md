# Hedwig Payment Contract Deployment Guide

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- `.env.local` file with the following variables:
  - `BASE_SEPOLIA_RPC_URL`: RPC URL for Base Sepolia testnet
  - `PLATFORM_PRIVATE_KEY`: Private key for the deployer account
  - `HEDWIG_PLATFORM_WALLET_TESTNET`: (Optional) Platform wallet address for testnet
  - `HEDWIG_PLATFORM_WALLET_MAINNET`: (Optional) Platform wallet address for mainnet

## Deployment Scripts

Two deployment scripts are provided:

### Windows (PowerShell)

```powershell
.\scripts\deploy-with-foundry.ps1
```

### Unix/Linux/Mac (Bash)

```bash
./scripts/deploy-with-foundry.sh
```

## Deployment Process

1. The script loads environment variables from `.env.local`
2. It checks for required environment variables
3. It deploys the HedwigPayment contract using Foundry
4. After successful deployment, it extracts and displays the contract address
5. It provides instructions for adding the contract address to your `.env.local` file

## After Deployment

Add the deployed contract address to your `.env.local` file:

```
HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=0x...
```

## Deployment Script Details

### `script/Counter.s.sol`

This is the Foundry script that handles the actual deployment. It:

1. Gets the platform wallet address from environment variables
2. Gets the private key from environment variables
3. Broadcasts the transaction to deploy the HedwigPayment contract
4. Logs the deployment details

## Troubleshooting

- If you encounter an error about missing environment variables, make sure your `.env.local` file is properly set up
- If you see a "Dry run enabled" warning, make sure you're using the `--broadcast` flag
- If you encounter checksum address errors, make sure your addresses are properly checksummed