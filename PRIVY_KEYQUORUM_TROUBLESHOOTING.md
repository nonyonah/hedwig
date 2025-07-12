# Privy KeyQuorum Troubleshooting Guide

## Common Issues and Solutions

### 1. Missing Environment Variables Error

**Error Message:**
```
[generatePrivyAuthorizationSignature] Missing environment variables: [
  'PRIVY_APP_ID',
  'PRIVY_APP_SECRET', 
  'PRIVY_AUTHORIZATION_KEY',
  'PRIVY_KEY_QUORUM_ID'
]
```

**Solution:**
Ensure all required environment variables are set in your `.env.local` file:

```bash
# Privy Configuration
PRIVY_APP_ID=your_actual_privy_app_id
PRIVY_APP_SECRET=your_actual_privy_app_secret

# Privy KeyQuorum Configuration
PRIVY_KEY_QUORUM_ID=your_actual_key_quorum_id
PRIVY_AUTHORIZATION_KEY=your_actual_authorization_key
```

**How to get these values:**
1. **PRIVY_APP_ID & PRIVY_APP_SECRET**: Get from your Privy Dashboard → App Settings
2. **PRIVY_KEY_QUORUM_ID**: Get from Privy Dashboard → KeyQuorum settings
3. **PRIVY_AUTHORIZATION_KEY**: Generate using the provided script:
   ```bash
   node scripts/generate-privy-key-pair.js
   ```

### 2. KeyQuorum User Session Key Expired

**Error Message:**
```
[sendPrivyTransaction] Privy API error: 401 {"error":"KeyQuorum user session key is expired"}
```

**Root Causes:**
- Session signers not properly configured
- User session has expired and needs refresh
- Missing or invalid session signer permissions

**Solutions:**

#### A. Enable Session Signers in Client
Ensure your React app properly initializes session signers:

```typescript
// In your component
import { useSessionSigners } from '../hooks/useSessionSigners';

function YourComponent() {
  const { sessionStatus, checkSessionStatus, createSessionSigner } = useSessionSigners();
  
  useEffect(() => {
    if (sessionStatus === 'expired' || sessionStatus === 'none') {
      createSessionSigner();
    }
  }, [sessionStatus]);
}
```

#### B. Server-Side Session Management
The app now uses server-side session signer management. Ensure the API endpoints are working:

- **Status Check**: `GET /api/session-signers/status`
- **Create Signer**: `POST /api/session-signers/create`

#### C. Manual Session Refresh
If sessions keep expiring, implement a refresh mechanism:

```typescript
// Force refresh session signers
const refreshSession = async () => {
  try {
    const response = await fetch('/api/session-signers/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log('Session signer refreshed successfully');
    }
  } catch (error) {
    console.error('Failed to refresh session signer:', error);
  }
};
```

### 3. Environment Variable Validation

**Check your configuration:**
```bash
# Run this to validate your environment
node -e "console.log({
  PRIVY_APP_ID: process.env.PRIVY_APP_ID ? 'SET' : 'MISSING',
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET ? 'SET' : 'MISSING',
  PRIVY_AUTHORIZATION_KEY: process.env.PRIVY_AUTHORIZATION_KEY ? 'SET' : 'MISSING',
  PRIVY_KEY_QUORUM_ID: process.env.PRIVY_KEY_QUORUM_ID ? 'SET' : 'MISSING'
})"
```

### 4. Development vs Production Configuration

**Development (.env.local):**
```bash
PRIVY_APP_ID=your_dev_app_id
PRIVY_APP_SECRET=your_dev_app_secret
PRIVY_KEY_QUORUM_ID=your_dev_key_quorum_id
PRIVY_AUTHORIZATION_KEY=your_dev_authorization_key
```

**Production:**
Ensure environment variables are set in your deployment platform (Vercel, Railway, etc.)

### 5. Debugging Steps

1. **Check Environment Loading:**
   ```typescript
   // Add to your API route or component
   console.log('Environment check:', {
     hasAppId: !!process.env.PRIVY_APP_ID,
     hasAppSecret: !!process.env.PRIVY_APP_SECRET,
     hasAuthKey: !!process.env.PRIVY_AUTHORIZATION_KEY,
     hasKeyQuorumId: !!process.env.PRIVY_KEY_QUORUM_ID
   });
   ```

2. **Validate Crypto Utils:**
   ```typescript
   import { validateCryptoEnvironment } from '../lib/cryptoUtils';
   
   const validation = validateCryptoEnvironment();
   console.log('Crypto validation:', validation);
   ```

3. **Test Session Signer Status:**
   ```bash
   curl -X GET http://localhost:3000/api/session-signers/status \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

### 6. Common Fixes

#### Restart Development Server
After adding environment variables:
```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

#### Clear Next.js Cache
```bash
rm -rf .next
npm run dev
```

#### Verify File Permissions
Ensure `.env.local` is readable:
```bash
ls -la .env.local
```

### 7. Error Recovery

The transaction handler includes automatic retry logic with exponential backoff. If you're still seeing errors:

1. Check that session signers are being created successfully
2. Verify the user has proper wallet permissions
3. Ensure the KeyQuorum configuration in Privy Dashboard is correct
4. Test with a fresh user session

### 8. Monitoring and Logging

Add enhanced logging to track session signer lifecycle:

```typescript
// In your transaction handler
console.log('[Transaction] Session status before transaction:', sessionStatus);
console.log('[Transaction] User wallet address:', user?.wallet?.address);
console.log('[Transaction] Environment validation:', validateCryptoEnvironment());
```

## Next Steps

1. Set up all required environment variables
2. Test session signer creation in development
3. Verify transaction flow with proper session signers
4. Monitor logs for any remaining issues
5. Consider implementing session signer refresh automation

For additional support, check the [Privy Documentation](https://docs.privy.io/) or the main implementation guide in `PRIVY_SESSION_SIGNERS_GUIDE.md`.