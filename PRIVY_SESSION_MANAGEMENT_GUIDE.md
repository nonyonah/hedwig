# Privy Session Management Implementation Guide

This guide documents the implementation of Privy support's recommendations for resolving "KeyQuorum user session key is expired" errors.

## Overview

Based on Privy support's recommendations, we have implemented:
1. **ECDH P-256 keypair generation** for session signers
2. **Active user session validation** to ensure users have valid sessions
3. **Comprehensive session management** with proper caching and refresh mechanisms

## Key Components

### 1. ECDH P-256 Keypair Generation (`src/lib/cryptoUtils.ts`)

```typescript
// Generate ECDH P-256 keypair as recommended by Privy support
const keypair = await generateECDHP256KeyPair();
```

This function generates the required ECDH P-256 keypairs that Privy recommends for session signer authorization.

### 2. Session Manager (`src/lib/sessionManager.ts`)

A comprehensive session management system that:
- Validates user sessions before transactions
- Generates and manages ECDH P-256 keypairs
- Implements session caching and expiration
- Provides session refresh capabilities

**Key Methods:**
- `validateUserSession(walletAddress)` - Ensures user has active session
- `refreshUserSession(walletAddress)` - Refreshes expired sessions with new keypairs
- `generateSessionKeyPair()` - Creates ECDH P-256 keypairs

### 3. Enhanced Privy Provider Configuration (`src/pages/_app.tsx`)

```typescript
<PrivyProvider
  appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
  config={{
    appearance: { theme: 'light' },
    loginMethods: ['email'],
    embeddedWallets: {
      createOnLogin: 'users-without-wallets',
    },
    sessionSigners: {
      enabled: true, // ✅ Now enabled for proper session management
    },
  }}
>
```

### 4. Enhanced Session Signers Hook (`src/hooks/useSessionSigners.ts`)

Added `checkActiveUserSession()` function to validate:
- User is logged in and authenticated
- User has embedded wallets
- Session is active and valid

### 5. Improved Wallet API (`src/lib/privyWalletApi.ts`)

The `refreshWalletSession` method now follows Privy's recommendations:

1. **Validate user session** using SessionManager
2. **Verify wallet ownership** through Privy's server client
3. **Generate new ECDH P-256 keypair** for session refresh
4. **Wait for session propagation** before retrying transactions

## Usage Examples

### Client-Side Session Validation

```typescript
import { useSessionSigners } from '@/hooks/useSessionSigners';

function MyComponent() {
  const { checkActiveUserSession, hasActiveSession } = useSessionSigners();
  
  const handleTransaction = async () => {
    // Check if user has active session before proceeding
    if (!checkActiveUserSession()) {
      console.error('No active user session');
      return;
    }
    
    // Proceed with transaction...
  };
}
```

### Server-Side Session Management

```typescript
import { sessionManager } from '@/lib/sessionManager';

// Validate user session
const sessionInfo = await sessionManager.validateUserSession(walletAddress);
if (!sessionInfo) {
  throw new Error('Invalid user session');
}

// Refresh session if needed
const refreshed = await sessionManager.refreshUserSession(walletAddress);
```

## Error Resolution Flow

When "KeyQuorum user session key is expired" occurs:

1. **Detect Error**: Transaction fails with session expiration message
2. **Validate Session**: Check if user has active session in app
3. **Generate Keypair**: Create new ECDH P-256 keypair for authorization
4. **Refresh Session**: Update session with new keypair
5. **Retry Transaction**: Attempt transaction again with refreshed session

## Environment Variables Required

Ensure these environment variables are configured:

```env
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
PRIVY_KEY_QUORUM_ID=your_key_quorum_id
PRIVY_AUTHORIZATION_KEY=your_authorization_key
```

## Privy Dashboard Configuration

1. **Enable Session Signers**: In your Privy Dashboard, enable server-side access for session signers
2. **Generate Authorization Keypair**: Create an authorization keypair in the dashboard
3. **Configure Policies**: Set up policies to control what actions session signers can perform
4. **Add Session Signers**: Add session signers to your wallet's key quorum

## Monitoring and Debugging

The implementation includes comprehensive logging:

- `[SessionManager]` - Session validation and refresh operations
- `[PrivyWalletApi]` - Transaction attempts and session refresh
- `[useSessionSigners]` - Client-side session status checks

## Best Practices

1. **Always validate user sessions** before attempting transactions
2. **Use the SessionManager** for consistent session handling
3. **Monitor session expiration** and refresh proactively
4. **Handle session errors gracefully** with proper retry mechanisms
5. **Keep ECDH P-256 keypairs secure** and rotate them regularly

## Testing the Implementation

1. **Test Session Validation**: Ensure `checkActiveUserSession()` works correctly
2. **Test Session Refresh**: Trigger session expiration and verify refresh works
3. **Test Transaction Retry**: Confirm transactions succeed after session refresh
4. **Monitor Logs**: Check that ECDH P-256 keypairs are generated successfully

## Troubleshooting

If you still encounter session expiration errors:

1. **Check Environment Variables**: Ensure all Privy credentials are correct
2. **Verify Dashboard Configuration**: Confirm session signers are enabled
3. **Check User Authentication**: Ensure users are properly logged in
4. **Review Logs**: Look for specific error messages in session management
5. **Contact Privy Support**: If issues persist, provide logs and configuration details

This implementation follows Privy support's specific recommendations and should significantly reduce or eliminate "KeyQuorum user session key is expired" errors.