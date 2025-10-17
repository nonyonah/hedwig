# Wallet Setup Guide

## Overview

Hedwig uses Reown AppKit (formerly WalletConnect AppKit) for wallet connectivity, providing support for multiple wallets and networks.

## Supported Wallets

- **MetaMask**: Browser extension and mobile app
- **WalletConnect**: Universal protocol supporting 300+ wallets
- **Coinbase Wallet**: Native Coinbase wallet integration
- **Injected Wallets**: Brave, Trust Wallet, and other browser wallets

## Supported Networks

| Network | Chain ID | Native Token | RPC Endpoint |
|---------|----------|--------------|--------------|
| Base | 8453 | ETH | https://mainnet.base.org |
| Ethereum | 1 | ETH | https://eth.llamarpc.com |
| Polygon | 137 | MATIC | https://polygon-rpc.com |
| Arbitrum | 42161 | ETH | https://arb1.arbitrum.io/rpc |
| BSC | 56 | BNB | https://bsc-dataseed.binance.org |
| Celo | 42220 | CELO | https://forno.celo.org |
| Lisk | 1135 | ETH | https://rpc.api.lisk.com |

## Configuration

### Environment Variables

```env
# Required: WalletConnect Project ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### Getting a WalletConnect Project ID

1. Visit [WalletConnect Cloud](https://cloud.walletconnect.com/)
2. Create a new project
3. Copy the Project ID
4. Add it to your `.env.local` file

## Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env.local
# Edit .env.local with your WalletConnect Project ID
```

### 3. Start Development Server
```bash
npm run dev
```

## Wallet Integration

### Basic Usage

```typescript
import { useAppKitWallet } from '@/hooks/useAppKitWallet'
import { AppKitButton } from '@/components/AppKitButton'

function MyComponent() {
  const { isConnected, address, connectWallet } = useAppKitWallet()

  return (
    <div>
      {isConnected ? (
        <p>Connected: {address}</p>
      ) : (
        <AppKitButton />
      )}
    </div>
  )
}
```

### Advanced Usage

```typescript
import { useAppKitWallet } from '@/hooks/useAppKitWallet'

function PaymentComponent() {
  const { 
    isConnected, 
    address, 
    chainId, 
    switchToChain, 
    signMessage 
  } = useAppKitWallet()

  const handlePayment = async () => {
    if (!isConnected) {
      await connectWallet()
      return
    }

    // Switch to Base network if needed
    if (chainId !== 8453) {
      await switchToChain(8453)
    }

    // Sign message or send transaction
    const signature = await signMessage('Payment confirmation')
    // ... payment logic
  }

  return (
    <button onClick={handlePayment}>
      Pay with Crypto
    </button>
  )
}
```

## Network Switching

The wallet system automatically handles network switching:

```typescript
const { switchToChain, isChainSupported } = useAppKitWallet()

// Switch to Base network
await switchToChain(8453)

// Check if network is supported
if (isChainSupported(chainId)) {
  // Network is supported
}
```

## Error Handling

```typescript
import { WalletErrorHandler } from '@/lib/walletErrorHandler'

try {
  await connectWallet()
} catch (error) {
  const walletError = WalletErrorHandler.handleConnectionError(error)
  
  if (WalletErrorHandler.isUserRejection(walletError)) {
    // User rejected connection
    toast.info('Connection cancelled by user')
  } else if (WalletErrorHandler.shouldRetry(walletError)) {
    // Retry connection
    setTimeout(() => connectWallet(), 2000)
  } else {
    // Show error message
    toast.error(walletError.message)
  }
}
```

## Testing

### Manual Testing
1. Connect different wallet types
2. Switch between networks
3. Sign messages and send transactions
4. Test error scenarios (user rejection, network errors)

### Automated Testing
```bash
# Test wallet migration status
curl http://localhost:3000/api/test-wallet-migration

# Check for TypeScript errors
npm run build
```

## Troubleshooting

### Common Issues

1. **Wallet Not Connecting**
   - Check WalletConnect Project ID is set
   - Ensure wallet extension is installed and unlocked
   - Try refreshing the page

2. **Network Switching Fails**
   - Check if network is supported
   - Ensure wallet supports the target network
   - Try manually adding the network to your wallet

3. **Transaction Fails**
   - Check wallet has sufficient balance
   - Verify gas settings
   - Ensure correct network is selected

### Debug Information

```typescript
// Check wallet configuration
console.log('Wallet Config:', wagmiConfig)

// Check connection status
const wallet = useAppKitWallet()
console.log('Wallet Status:', {
  isConnected: wallet.isConnected,
  address: wallet.address,
  chainId: wallet.chainId
})
```

## Migration from OnchainKit

If you're migrating from the old OnchainKit system:

1. **Update Imports**:
   ```typescript
   // Old
   import { ConnectWallet } from '@coinbase/onchainkit/wallet'
   
   // New
   import { AppKitButton } from '@/components/AppKitButton'
   ```

2. **Update Components**:
   ```typescript
   // Old
   <ConnectWallet />
   
   // New
   <AppKitButton />
   ```

3. **Update Hooks**:
   ```typescript
   // Old
   import { useWallet } from '@/providers/WalletProvider'
   
   // New (both work, but AppKit is preferred)
   import { useAppKitWallet } from '@/hooks/useAppKitWallet'
   ```

## Support

For wallet-related issues:
- Check the [troubleshooting section](#troubleshooting)
- Review browser console for error messages
- Test with different wallets and networks
- Contact support with specific error details