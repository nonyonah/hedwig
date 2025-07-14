# User Signer Implementation Guide

This document explains the implementation of Privy User Signers to resolve the "keyquorum user session key expired" error and provide proper authentication flow.

## Overview

The implementation follows Privy's official documentation for User Signers, which replaces the old session refresh mechanism with a proper re-authentication flow using HPKE (Hybrid Public Key Encryption).

## Key Components

### 1. User Signer Authentication Flow

**File**: `src/pages/api/user-signers/authenticate.ts`

This endpoint implements the complete user signer authentication flow:

1. **ECDH P-256 Keypair Generation**: Generates a new ECDH P-256 keypair for each authentication request
2. **Privy Authentication**: Calls Privy's `/v1/user_signers/authenticate` endpoint with the recipient public key
3. **HPKE Response Handling**: Receives and stores the encrypted authorization key and encapsulated key
4. **Session Management**: Updates the user session with the new authentication data

### 2. HPKE Decryption

**File**: `src/lib/cryptoUtils.ts`

Implements HPKE decryption for the authorization key:

- `decryptHPKEAuthorizationKey()`: Decrypts the authorization key using ECDH and the encapsulated key
- Handles the P-256 curve operations required by Privy's encryption format
- Includes fallback mechanisms for development environments

### 3. PrivyClient Management

**File**: `src/lib/privyClientManager.ts`

Manages PrivyClient instances with proper user signer authorization:

- **Client Caching**: Caches PrivyClient instances with decrypted authorization keys
- **Automatic Decryption**: Handles HPKE decryption transparently
- **Session Integration**: Works with the SessionManager to get authentication data
- **Cache Management**: Automatic cleanup of expired client instances

### 4. Updated Session Management

**File**: `src/lib/sessionManager.ts`

Updated to support the new user signer flow:

- **Deprecated Methods**: `refreshSession()` is now deprecated
- **New Method**: `reAuthenticateUserSigner()` implements the proper re-authentication flow
- **HPKE Support**: Stores both encrypted authorization key and encapsulated key
- **Session Structure**: Updated to include all required fields for HPKE decryption

### 5. Frontend Integration

**File**: `src/hooks/useSessionSigners.ts`

Updated React hook with new authentication methods:

- `authenticateUserSigner()`: Triggers user signer authentication
- `requestSessionSigner()`: Uses the new authentication flow
- Improved error handling and user feedback

## Implementation Details

### ECDH P-256 Keypair Generation

```typescript
const { privateKey, publicKey } = await generateECDHP256KeyPair();
const recipientPublicKey = await exportPublicKeyToBase64(publicKey);
```

### User Signer Authentication Request

```typescript
const authResponse = await fetch(`https://auth.privy.io/api/v1/user_signers/authenticate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    'privy-app-id': process.env.PRIVY_APP_ID!,
  },
  body: JSON.stringify({
    recipient_public_key: recipientPublicKey
  })
});
```

### HPKE Decryption Process

1. **Import Keys**: Import the private key and ephemeral public key
2. **ECDH Operation**: Derive shared secret using ECDH
3. **Key Derivation**: Use the shared secret for AES-GCM decryption
4. **Decryption**: Decrypt the authorization key

### PrivyClient Initialization

```typescript
const client = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
  {
    walletApi: {
      authorizationPrivateKey: decryptedAuthKey
    }
  }
);
```

## Error Resolution

### "keyquorum user session key expired" Error

This error was caused by:

1. **Improper Session Refresh**: The old implementation tried to "refresh" sessions instead of re-authenticating
2. **Missing Authorization Key**: No proper authorization key was being used for wallet operations
3. **Expired Sessions**: Sessions were not being properly re-authenticated when expired

### Solution

The new implementation resolves this by:

1. **Full Re-authentication**: Instead of refreshing, we perform complete user signer authentication
2. **HPKE Decryption**: Properly decrypt and use the authorization key from Privy
3. **Proper Client Initialization**: Initialize PrivyClient with the decrypted authorization key
4. **Session Management**: Track authentication state and trigger re-authentication when needed

## Usage Examples

### Frontend Usage

```typescript
const { authenticateUserSigner, requestSessionSigner } = useSessionSigners();

// Authenticate user signer
const result = await authenticateUserSigner(walletAddress);
if (result) {
  console.log('User signer authenticated successfully');
}

// Request session signer creation
const success = await requestSessionSigner();
if (success) {
  console.log('Session signer created successfully');
}
```

### Backend Usage

```typescript
// Get PrivyClient with user signer authorization
const privyClient = await privyClientManager.getClientForWallet(walletAddress);
if (privyClient) {
  // Use the client for wallet operations
  // const result = await privyClient.addSessionSigners({...});
}
```

## Security Considerations

1. **Key Storage**: Private keys are stored temporarily in memory and session cache
2. **HPKE Security**: Uses industry-standard HPKE encryption for key exchange
3. **Session Expiration**: Automatic re-authentication when sessions expire
4. **Cache Management**: Automatic cleanup of expired authentication data

## Development vs Production

### Development Mode
- Includes fallback mechanisms for testing
- Enhanced logging for debugging
- Graceful error handling

### Production Mode
- Full HPKE implementation required
- Proper error handling and user feedback
- Secure key storage and management

## Migration Guide

### From Old Session Refresh

1. **Replace** `sessionManager.refreshSession()` calls with `sessionManager.reAuthenticateUserSigner()`
2. **Update** frontend code to use `authenticateUserSigner()` instead of session refresh
3. **Use** `privyClientManager.getClientForWallet()` for PrivyClient instances
4. **Handle** the new error codes and response formats

### Testing the Implementation

1. **User Authentication**: Verify users can authenticate successfully
2. **Session Management**: Test session expiration and re-authentication
3. **Wallet Operations**: Confirm wallet operations work with the new authorization
4. **Error Handling**: Test error scenarios and fallback mechanisms

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**: Ensure all Privy environment variables are set
2. **HPKE Decryption Errors**: Check key formats and encryption parameters
3. **Session Expiration**: Verify re-authentication triggers properly
4. **Client Initialization**: Confirm PrivyClient is initialized with the correct authorization key

### Debug Logging

The implementation includes comprehensive logging:
- `[UserSignerAuth]`: User signer authentication process
- `[SessionManager]`: Session management operations
- `[PrivyClientManager]`: Client creation and caching
- `[decryptHPKEAuthorizationKey]`: HPKE decryption process

## References

- [Privy User Signers Documentation](https://docs.privy.io/wallets/using-wallets/user-signers/usage)
- [HPKE Specification](https://datatracker.ietf.org/doc/html/rfc9180)
- [Privy Authentication API](https://docs.privy.io/api-reference/signers/authenticate)