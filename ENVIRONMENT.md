# Environment Variables Management

## Overview

This document outlines best practices for handling environment variables in the Hedwig application, particularly API keys and secrets.

## Environment Variables Used

The application requires the following environment variables:

### Critical Variables (Required)

- `PRIVY_APP_ID`: Your Privy application ID
- `PRIVY_APP_SECRET`: Your Privy application secret
- `WHATSAPP_ACCESS_TOKEN`: WhatsApp Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp phone number ID
- `WHATSAPP_VERIFY_TOKEN`: Token for webhook verification

### Database Variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

### Blockchain Variables

- `RPC_URL`: RPC URL for blockchain connection (defaults to Base Sepolia)
- `NETWORK_ID`: Network ID for blockchain (defaults to base-sepolia)

## Development vs Production

### Development Environment

For local development:
1. Copy `.env.example` to `.env.local`
2. Update with your actual API keys
3. Never commit `.env.local` to Git (it's in .gitignore)

The application has fallbacks for development, but real keys are recommended for full testing.

### Production Environment

For production deployment:

- **Vercel/Netlify**: Add environment variables through the provider's dashboard.
- **Self-hosted**: Use a proper secrets management system.

## Secure Handling of API Keys

### Never hardcode API keys in code

❌ **Incorrect**:
```typescript
const API_KEY = "1234567890abcdef";
```

✅ **Correct**:
```typescript
const API_KEY = process.env.MY_API_KEY;
```

### Avoid client-side exposure

- Use `NEXT_PUBLIC_` prefix only for values that are safe to expose to the browser
- Keep sensitive keys server-side only

## Deployment-Specific Configuration

### Netlify

In Netlify:
1. Go to Site settings > Environment variables
2. Add all required variables
3. Redeploy your site

### Vercel

In Vercel:
1. Go to Project settings > Environment Variables
2. Add all required variables
3. Redeploy your application

## Key Rotation

Regularly rotate your API keys for security:

1. Generate new keys from the service provider
2. Update your environment variables
3. Deploy the updated configuration

## Using Default Values

If you need default values for development:

```typescript
// In serverEnv.ts
export function getEnvironment() {
  const isDev = process.env.NODE_ENV === 'development';
  
  // Use a development fallback only in development
  const apiKey = process.env.API_KEY || (isDev ? 'dev-key' : undefined);
  
  if (!apiKey) {
    throw new Error('Missing required API_KEY');
  }
  
  return { apiKey };
}
```

## Environment Files Priority

The application tries to load environment variables from:
1. `.env.local` (highest priority)
2. `.env.development.local` or `.env.production.local`
3. `.env.development` or `.env.production`
4. `.env` (lowest priority)

## Git Security

Never commit sensitive values to Git:

- Add `.env*` files to `.gitignore` (except `.env.example`)
- Use `.env.example` with placeholder values for documentation
- Use environment variable management in CI/CD pipelines

## Environment Variable Validation

The application validates environment variables at startup, ensuring all required variables are present before running.

## Using Secret Vaults (Advanced)

For enhanced security, consider integrating with:
- AWS Secrets Manager
- HashiCorp Vault
- Google Secret Manager
- Azure Key Vault

## Troubleshooting

If environment variables aren't loading:
1. Check if file names are correct (`.env.local` not `.env`)
2. Verify the variables are defined with the correct names
3. Restart your development server
4. Check platform-specific loading requirements 