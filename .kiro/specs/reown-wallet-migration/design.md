# Design Document

## Overview

This design document outlines the architecture and implementation approach for migrating from Coinbase OnchainKit/RainbowKit to Reown AppKit for wallet connectivity. The migration will maintain all existing functionality while providing a more modern and flexible wallet connection experience.

## Architecture

### Current Architecture
```
App Component
├── WagmiProvider (wagmi)
├── QueryClientProvider (@tanstack/react-query)
├── RainbowKitProvider (@rainbow-me/rainbowkit)
├── OnchainKitProvider (@coinbase/onchainkit)
└── WalletProviderWrapper (custom)
    └── Application Components
        ├── ConnectWallet (@coinbase/onchainkit)
        ├── useAccount (wagmi)
        ├── useWriteContract (wagmi)
        └── Custom wallet hooks
```

### New Architecture
```
App Component
├── WagmiProvider (wagmi) - kept for compatibility
├── QueryClientProvider (@tanstack/react-query)
├── ReownAppKitProvider (@reown/appkit)
└── Application Components
    ├── appkit-button (Reown AppKit)
    ├── useAppKit hooks
    ├── useAccount (wagmi) - maintained for existing code
    └── Updated wallet hooks
```

## Components and Interfaces

### 1. AppKit Configuration (`src/lib/appkit.ts`)

**Purpose**: Central configuration for Reown AppKit
**Key Features**:
- Multi-chain support (Base, Ethereum, Polygon, Arbitrum, BSC, Celo, Lisk)
- WalletConnect integration
- Custom theme configuration
- Network switching capabilities

```typescript
interface AppKitConfig {
  projectId: string;
  chains: Chain[];
  defaultChain: Chain;
  metadata: AppMetadata;
  features: AppKitFeatures;
  themeMode: 'light' | 'dark' | 'system';
}
```

### 2. Updated App Provider (`src/pages/_app.tsx`)

**Purpose**: Replace OnchainKit and RainbowKit providers with Reown AppKit
**Changes**:
- Remove `OnchainKitProvider` and `RainbowKitProvider`
- Add `createAppKit` initialization
- Maintain `WagmiProvider` for backward compatibility
- Update theme and styling imports

### 3. Wallet Connection Components

**Purpose**: Replace Coinbase OnchainKit wallet components with Reown AppKit equivalents

**Component Mapping**:
- `ConnectWallet` (@coinbase/onchainkit) → `<appkit-button>` (Reown AppKit)
- Custom wallet buttons → `useAppKit()` hooks
- Wallet modals → Built-in AppKit modals

### 4. Updated Wallet Hooks (`src/hooks/useWallet.ts`)

**Purpose**: Provide a unified interface for wallet operations using Reown AppKit
**Key Methods**:
- `connect()` - Connect wallet using AppKit
- `disconnect()` - Disconnect wallet
- `switchChain(chainId)` - Switch to different network
- `getAccount()` - Get current account information
- `signMessage(message)` - Sign messages
- `sendTransaction(params)` - Send transactions

### 5. Chain Configuration (`src/lib/chains.ts`)

**Purpose**: Define supported blockchain networks for AppKit
**Networks**:
- Base Mainnet (primary)
- Ethereum Mainnet
- Polygon
- Arbitrum
- BSC
- Celo
- Lisk

### 6. Migration Utilities (`src/lib/walletMigration.ts`)

**Purpose**: Helper functions to ease the migration process
**Features**:
- Compatibility layer for existing wagmi hooks
- Error handling and fallbacks
- State synchronization between old and new systems

## Data Models

### AppKit State Interface
```typescript
interface AppKitState {
  isConnected: boolean;
  address?: string;
  chainId?: number;
  balance?: string;
  ensName?: string;
  ensAvatar?: string;
}
```

### Wallet Connection Event
```typescript
interface WalletConnectionEvent {
  type: 'connect' | 'disconnect' | 'chainChanged' | 'accountChanged';
  address?: string;
  chainId?: number;
  previousAddress?: string;
  previousChainId?: number;
}
```

### Chain Configuration
```typescript
interface ChainConfig {
  id: number;
  name: string;
  network: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: {
    default: { http: string[] };
    public: { http: string[] };
  };
  blockExplorers: {
    default: { name: string; url: string };
  };
}
```

## Error Handling

### Connection Errors
- **User Rejection**: Handle when user cancels wallet connection
- **Network Errors**: Handle RPC failures and network connectivity issues
- **Unsupported Wallets**: Graceful fallback for unsupported wallet types
- **Chain Switching**: Handle failures when switching networks

### Transaction Errors
- **Insufficient Funds**: Clear error messages for low balance
- **Gas Estimation**: Handle gas estimation failures
- **Transaction Rejection**: Handle user transaction cancellation
- **Network Congestion**: Retry mechanisms for failed transactions

### Error Recovery Strategies
1. **Automatic Retry**: For transient network errors
2. **User Guidance**: Clear instructions for user-actionable errors
3. **Fallback Options**: Alternative connection methods when primary fails
4. **State Recovery**: Restore previous state after errors

## Testing Strategy

### Unit Tests
- **AppKit Configuration**: Test chain configurations and metadata
- **Wallet Hooks**: Test connection, disconnection, and state management
- **Component Integration**: Test wallet button and modal interactions
- **Error Handling**: Test various error scenarios and recovery

### Integration Tests
- **End-to-End Wallet Flow**: Complete wallet connection and transaction flow
- **Multi-Chain Testing**: Test network switching and cross-chain functionality
- **Payment Integration**: Test payment links, invoices, and proposals with new wallet system
- **State Persistence**: Test wallet state across page refreshes and navigation

### Migration Testing
- **Backward Compatibility**: Ensure existing features work with new wallet system
- **Performance Testing**: Compare bundle size and load times
- **Cross-Browser Testing**: Test wallet connectivity across different browsers
- **Mobile Testing**: Test mobile wallet connections and responsive design

### Test Scenarios
1. **Fresh Installation**: New user connecting wallet for first time
2. **Existing User Migration**: User with existing wallet connection
3. **Network Switching**: User switching between supported networks
4. **Multiple Wallets**: User with multiple wallet extensions installed
5. **Connection Recovery**: Recovering from connection failures
6. **Transaction Flows**: Complete payment flows with new wallet system

## Implementation Phases

### Phase 1: Core Infrastructure
- Set up Reown AppKit configuration
- Create new provider structure
- Implement basic wallet connection
- Update main app component

### Phase 2: Component Migration
- Replace ConnectWallet components
- Update wallet-dependent pages
- Migrate custom wallet hooks
- Update styling and themes

### Phase 3: Feature Integration
- Test payment functionality
- Update transaction handling
- Verify multi-chain support
- Test error scenarios

### Phase 4: Cleanup and Optimization
- Remove legacy dependencies
- Optimize bundle size
- Update documentation
- Performance testing

## Security Considerations

### Wallet Security
- **Private Key Protection**: Ensure private keys never leave user's wallet
- **Transaction Verification**: Verify transaction details before signing
- **Network Validation**: Validate network parameters and RPC endpoints
- **Permission Management**: Proper handling of wallet permissions

### Application Security
- **State Validation**: Validate wallet state and user inputs
- **Error Information**: Avoid exposing sensitive information in errors
- **Session Management**: Secure handling of wallet session data
- **Cross-Site Scripting**: Prevent XSS attacks through wallet interactions

## Performance Considerations

### Bundle Size Optimization
- **Tree Shaking**: Remove unused wallet library code
- **Lazy Loading**: Load wallet components only when needed
- **Code Splitting**: Separate wallet code from main application bundle

### Runtime Performance
- **Connection Speed**: Optimize wallet connection time
- **State Updates**: Efficient state management and updates
- **Memory Usage**: Prevent memory leaks from wallet event listeners
- **Network Requests**: Minimize unnecessary RPC calls

## Migration Strategy

### Gradual Migration Approach
1. **Parallel Implementation**: Run both systems temporarily
2. **Feature Flagging**: Toggle between old and new wallet systems
3. **User Testing**: Test with subset of users before full rollout
4. **Rollback Plan**: Ability to revert to previous system if needed

### Data Migration
- **Wallet Preferences**: Migrate user wallet preferences
- **Connection History**: Preserve wallet connection history
- **Transaction Data**: Ensure transaction history remains accessible

### User Communication
- **Migration Notice**: Inform users about wallet system updates
- **Help Documentation**: Update help docs with new wallet instructions
- **Support Preparation**: Prepare support team for migration-related questions