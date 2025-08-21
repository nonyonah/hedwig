#!/bin/bash

# Script to deploy HedwigPayment contract using Foundry
# This script uses environment variables from .env.local

# Load environment variables
set -a
source .env.local
set +a

# Check if RPC URL is provided
if [ -z "$BASE_SEPOLIA_RPC_URL" ]; then
  echo "Error: BASE_SEPOLIA_RPC_URL is not set in .env.local"
  exit 1
fi

# Check if private key is provided
if [ -z "$PLATFORM_PRIVATE_KEY" ]; then
  echo "Error: PLATFORM_PRIVATE_KEY is not set in .env.local"
  exit 1
fi

echo "Deploying HedwigPayment contract to Base Sepolia..."

# Run the forge script to deploy the contract
forge script script/Counter.s.sol:DeployHedwigPayment \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  -vvv

echo -e "\nDeployment complete!"

# Extract contract address from the logs
LOG_FILE=$(find broadcast/Counter.s.sol -name "run-latest.json" | sort -r | head -n 1)
if [ -f "$LOG_FILE" ]; then
    CONTRACT_ADDRESS=$(cat "$LOG_FILE" | grep -o '"contractAddress":"[^"]*"' | head -n 1 | cut -d '"' -f 4)
    
    if [ ! -z "$CONTRACT_ADDRESS" ]; then
        echo -e "\033[36mContract Address: $CONTRACT_ADDRESS\033[0m"
        echo -e "\n\033[33mAdd this to your .env.local file:\033[0m"
        echo -e "\033[33mHEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=$CONTRACT_ADDRESS\033[0m"
    else
        echo -e "\033[31mCould not find contract address in deployment logs.\033[0m"
        echo -e "\033[33mCheck the logs above for the contract address.\033[0m"
    fi
else
    echo -e "\033[31mDeployment log file not found.\033[0m"
    echo -e "\033[33mCheck the logs above for the contract address.\033[0m"
fi