# Privy Session Signers Implementation Guide

## Problem Solved

This implementation fixes the "KeyQuorum user session key is expired" error by properly configuring Privy session signers for server-side transaction authorization.

## What Was Changed

### 1. Updated PrivyProvider Configuration (`src/pages/_app.tsx`)

Added session signer configuration to enable KeyQuorum authorization:

```typescript
sessionSigners: {
  enabled: true,
  // Session signers will be automatically created and managed
  // This enables KeyQuorum authorization for server-side transactions
},
embeddedWallets: {
  createOnLogin: 'users-without-wallets',
  requireUserPasswordOnCreate: false,
  noPromptOnSignature: false,
},
```

### 2. Created Session Signer Hook (`src/hooks/useSessionSigners.ts`)

A React hook that provides:
- `hasSessionSigners`: Check if session signers are configured
- `addSessionSignerForKeyQuorum()`: Add session signers for KeyQuorum
- `ensureSessionSigners()`: Ensure session signers exist before transactions
- Error handling and loading states

### 3. Enhanced Server-Side Validation (`src/lib/transactionHandler.ts`)

Added:
- `hasSessionSigners()` function to validate session signer configuration
- Improved error messages for session expiration issues
- Better debugging information

## How Session Signers Work

1. **Client-Side Setup**: When a user logs in, session signers are automatically created by Privy
2. **Server-Side Authorization**: The server uses KeyQuorum with the authorization signature to validate transactions
3. **Delegation**: Session signers allow the server to sign transactions on behalf of the user without exposing private keys

## Implementation Steps for Frontend

To fully implement session signers in your application:

### 1. Use the Session Signer Hook

```typescript
import { useSessionSigners } from '@/hooks/useSessionSigners';

function WalletComponent() {
  const { hasSessionSigners, ensureSessionSigners, isAddingSessionSigner, error } = useSessionSigners();

  const handleTransaction = async () => {
    // Ensure session signers exist before making server-side transactions
    const success = await ensureSessionSigners();
    if (!success) {
      console.error('Failed to set up session signers');
      return;
    }

    // Proceed with transaction...
  };

  return (
    <div>
      {!hasSessionSigners && (
        <button onClick={ensureSessionSigners} disabled={isAddingSessionSigner}>
          {isAddingSessionSigner ? 'Setting up...' : 'Enable Transactions'}
        </button>
      )}
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

### 2. Check Session Signers Before Transactions

Before making any server-side transaction calls, ensure session signers are configured:

```typescript
const { ensureSessionSigners } = useSessionSigners();

// Before calling your transaction API
const success = await ensureSessionSigners();
if (success) {
  // Make transaction API call
  await fetch('/api/send-transaction', { ... });
}
```

## Environment Variables Required

Ensure these are set in your `.env.local`:

```bash
# Privy Configuration
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# KeyQuorum Configuration
PRIVY_KEY_QUORUM_ID=your_key_quorum_id
PRIVY_AUTHORIZATION_KEY=your_p256_private_key
```

## Testing the Implementation

1. **Generate Key Pair**: Run `node scripts/generate-privy-key-pair.js`
2. **Set Environment Variables**: Use the generated private key for `PRIVY_AUTHORIZATION_KEY`
3. **Register Public Key**: Register the public key with Privy KeyQuorum
4. **Test Transactions**: Try making transactions and verify session signers are working

## Troubleshooting

### "KeyQuorum user session key is expired" Error

**Cause**: Session signers are not properly configured or have expired.

**Solutions**:
1. Ensure session signers are enabled in PrivyProvider configuration
2. Call `ensureSessionSigners()` before making transactions
3. Check that the user is properly authenticated
4. Verify KeyQuorum configuration is correct

### Session Signers Not Being Created

**Cause**: PrivyProvider configuration is missing or incorrect.

**Solutions**:
1. Verify `sessionSigners.enabled: true` in PrivyProvider config
2. Ensure user has an embedded wallet
3. Check that the user is authenticated

### Authorization Signature Failures

**Cause**: KeyQuorum configuration issues.

**Solutions**:
1. Verify `PRIVY_AUTHORIZATION_KEY` is correctly formatted
2. Ensure the public key is registered with Privy
3. Check `PRIVY_KEY_QUORUM_ID` is correct

## Next Steps

1. **Frontend Integration**: Add session signer checks to your transaction flows
2. **User Experience**: Provide clear messaging when session signers need to be set up
3. **Error Handling**: Implement proper error handling for session signer failures
4. **Testing**: Test the complete flow from login to transaction
5. **Monitoring**: Add logging to track session signer usage and errors

## Key Benefits

- ✅ Fixes "KeyQuorum user session key is expired" errors
- ✅ Enables secure server-side transaction signing
- ✅ Maintains user control over wallet permissions
- ✅ Provides better error messages and debugging
- ✅ Follows Privy best practices for KeyQuorum

The implementation is now ready for testing and further integration into your application's transaction flows.