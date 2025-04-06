# Supabase Authentication Setup for Albus

This guide will help you set up Supabase authentication with Google and Apple sign-in for the Albus application.

## Prerequisites

1. A Supabase account (free tier is sufficient)
2. Google Developer account (for Google OAuth)
3. Apple Developer account (for Apple OAuth)

## Step 1: Create a Supabase Project

1. Go to [Supabase](https://supabase.com/) and sign in or create an account
2. Create a new project and give it a name (e.g., "Albus")
3. Wait for the database to be ready

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to Project Settings > API
2. Copy the "Project URL" and "anon/public" key
3. Open the `.env.local` file in your project and update it with these values:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Step 3: Configure Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Configure the OAuth consent screen if prompted
6. For Application type, select "Web application"
7. Add authorized JavaScript origins:
   - `http://localhost:3000` (for development)
   - Your production URL when deployed
8. Add authorized redirect URIs:
   - `http://localhost:3000/auth/callback` (for development)
   - `https://your-production-domain.com/auth/callback` (for production)
9. Click "Create" and note your Client ID and Client Secret

## Step 4: Configure Apple OAuth

1. Go to the [Apple Developer Portal](https://developer.apple.com/)
2. Navigate to "Certificates, Identifiers & Profiles" > "Identifiers"
3. Register a new App ID if you don't have one already
4. Enable "Sign In with Apple" capability
5. Create a Services ID for your website
6. Configure the domains and redirect URLs:
   - Domain: `localhost` (for development) and your production domain
   - Return URLs: `http://localhost:3000/auth/callback` and your production callback URL
7. Create a private key for Sign in with Apple
8. Download the key and note the Key ID

## Step 5: Add OAuth Providers to Supabase

1. In your Supabase dashboard, go to Authentication > Providers
2. Enable Google provider and add your Google Client ID and Secret
3. Enable Apple provider and add your Apple credentials

## Step 6: Test Authentication

1. Run your application locally with `npm run dev`
2. Try signing in with Google and Apple
3. Verify that the authentication flow works correctly

## Troubleshooting

- If you encounter CORS errors, make sure your redirect URLs are correctly configured in both Google/Apple developer consoles and Supabase
- Check the browser console for any authentication errors
- Verify that your environment variables are correctly set

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Next.js with Supabase Auth](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [Google OAuth Setup Guide](https://developers.google.com/identity/protocols/oauth2)
- [Sign in with Apple Documentation](https://developer.apple.com/sign-in-with-apple/)