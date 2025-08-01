# Hedwig Payment System - Wallet Setup Guide

## Overview
This guide explains how to set up and configure the platform wallet that will receive transaction fees from the Hedwig payment system.

## 🔧 Environment Configuration

### Required Environment Variables

Add these variables to your `.env` file:

```bash
# Hedwig Payment Contract Configuration
HEDWIG_PAYMENT_CONTRACT_ADDRESS=your_deployed_contract_address
HEDWIG_PLATFORM_WALLET=your_platform_fee_wallet_address
HEDWIG_PLATFORM_FEE=250  # Fee in basis points (250 = 2.5%)
PLATFORM_PRIVATE_KEY=your_platform_wallet_private_key
BASE_RPC_URL=https://mainnet.base.org
HEDWIG_ADMIN_KEY=your_admin_api_key

# Testnet Configuration (for development)
HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=your_testnet_contract_address
HEDWIG_PLATFORM_WALLET_TESTNET=your_testnet_platform_wallet
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

## 💰 Platform Wallet Setup

### 1. Create a Platform Wallet
- Generate a new Ethereum wallet specifically for receiving platform fees
- **IMPORTANT**: Keep the private key secure and never commit it to version control
- This wallet will automatically receive the platform fee from each payment

### 2. Set Platform Fee Percentage
- Default fee is 2.5% (250 basis points)
- Maximum allowed fee is 5% (500 basis points)
- Fee is automatically deducted from each payment and sent to the platform wallet

### 3. Wallet Address Format
- Must be a valid Ethereum address (42 characters starting with 0x)
- Example: `0x742d35Cc6634C0532925a3b8D4C9db96C4b4d4d4`

## 🚀 Deployment Steps

### 1. Deploy the Smart Contract
```bash
# Run the deployment script
node scripts/deploy-hedwig-payment.js
```

### 2. Configure Environment Variables
```bash
# Copy the contract address from deployment output
HEDWIG_PAYMENT_CONTRACT_ADDRESS=0x...

# Set your platform wallet address
HEDWIG_PLATFORM_WALLET=0x...

# Set platform fee (in basis points)
HEDWIG_PLATFORM_FEE=250
```

### 3. Initialize Contract Settings
Use the admin API to configure the contract:

```bash
# Set platform wallet
curl -X POST http://localhost:3000/api/admin/wallet-config \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your_admin_key" \
  -d '{
    "action": "setPlatformWallet",
    "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d4d4"
  }'

# Set platform fee
curl -X POST http://localhost:3000/api/admin/wallet-config \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your_admin_key" \
  -d '{
    "action": "setPlatformFee",
    "feeInBasisPoints": 250
  }'
```

## 🔐 Admin API Endpoints

### Get Current Configuration
```bash
GET /api/admin/wallet-config
Headers: x-admin-key: your_admin_key
```

### Update Platform Wallet
```bash
POST /api/admin/wallet-config
Headers: x-admin-key: your_admin_key
Body: {
  "action": "setPlatformWallet",
  "walletAddress": "0x..."
}
```

### Update Platform Fee
```bash
POST /api/admin/wallet-config
Headers: x-admin-key: your_admin_key
Body: {
  "action": "setPlatformFee",
  "feeInBasisPoints": 250
}
```

### Whitelist Token
```bash
POST /api/admin/wallet-config
Headers: x-admin-key: your_admin_key
Body: {
  "action": "whitelistToken",
  "tokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "status": true
}
```

## 💳 Supported Tokens

### Base Mainnet
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **USDbC**: `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA`

### Adding New Tokens
1. Use the admin API to whitelist new tokens
2. Ensure tokens follow ERC-20 standard
3. Test on testnet before mainnet deployment

## 📊 Fee Calculation

### How Fees Work
- Platform fee is calculated as a percentage of the payment amount
- Fee is automatically deducted and sent to the platform wallet
- Freelancer receives the remaining amount after fee deduction

### Example
- Payment: 100 USDC
- Platform fee (2.5%): 2.5 USDC → Platform wallet
- Freelancer receives: 97.5 USDC

## 🔍 Monitoring and Analytics

### Payment Events
Monitor payments through the events API:
```bash
GET /api/payment/events?freelancer=0x...
GET /api/payment/events?invoiceId=invoice_123
```

### Database Tables
- `payment_events`: All blockchain payment events
- `invoices`: Invoice status updates
- `proposals`: Proposal payment tracking

## 🛡️ Security Best Practices

### Private Key Management
- Store private keys in secure environment variables
- Use different keys for testnet and mainnet
- Never commit private keys to version control
- Consider using hardware wallets for production

### Access Control
- Secure the admin API key
- Implement IP whitelisting for admin endpoints
- Monitor admin actions and changes
- Regular security audits

### Smart Contract Security
- Contract is immutable once deployed
- Platform wallet can be updated by admin
- Fee percentage has maximum limits
- Emergency functions for token recovery

## 🧪 Testing

### Testnet Testing
1. Deploy contract to Base Sepolia
2. Use testnet tokens for testing
3. Verify fee calculations
4. Test wallet updates

### Production Checklist
- [ ] Contract deployed and verified
- [ ] Platform wallet configured
- [ ] Fee percentage set correctly
- [ ] Tokens whitelisted
- [ ] Admin API secured
- [ ] Monitoring setup
- [ ] Backup procedures in place

## 📞 Support

For technical support or questions:
- Check the contract README: `src/contracts/README.md`
- Review the smart contract code: `src/contracts/HedwigPayment.sol`
- Test with the admin API endpoints
- Monitor transaction logs and events

## 🔄 Updates and Maintenance

### Regular Tasks
- Monitor platform wallet balance
- Review fee collection analytics
- Update token whitelist as needed
- Security audits and updates
- Backup private keys securely

### Emergency Procedures
- Admin wallet compromise response
- Contract upgrade procedures
- Token recovery processes
- Incident response plan