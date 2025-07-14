# Database Schema Documentation

This document outlines the current database schema structure for the Hedwig application.

## Table Structures

### Users Table
```sql
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number text NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_active timestamp with time zone,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

**Columns:**
- `id` - Primary key (UUID)
- `phone_number` - User's phone number (unique)
- `created_at` - Account creation timestamp
- `last_active` - Last activity timestamp
- `updated_at` - Last update timestamp

### Wallets Table
```sql
CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    address text NOT NULL UNIQUE,
    private_key_encrypted text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

**Columns:**
- `id` - Primary key (UUID)
- `user_id` - Foreign key to users table
- `address` - Wallet address (unique)
- `private_key_encrypted` - Encrypted private key
- `created_at` - Wallet creation timestamp
- `updated_at` - Last update timestamp

### Sessions Table
```sql
CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### Tokens Table
```sql
CREATE TABLE public.tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_address text NOT NULL,
    symbol text NOT NULL,
    name text NOT NULL,
    balance text NOT NULL,
    decimals integer NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, token_address)
);
```

### NFTs Table
```sql
CREATE TABLE public.nfts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    token_id text NOT NULL,
    contract_address text NOT NULL,
    owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    image_url text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(contract_address, token_id, owner_id)
);
```

### Message Logs Table
```sql
CREATE TABLE public.message_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message_type text NOT NULL,
    content text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### Errors Table
```sql
CREATE TABLE public.errors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    error_type text NOT NULL,
    error_message text NOT NULL,
    stack_trace text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### Rate Limits Table
```sql
CREATE TABLE public.rate_limits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    request_count integer NOT NULL DEFAULT 1,
    first_request_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    last_request_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);
```

## Row Level Security (RLS) Policies

All tables have RLS enabled with appropriate policies:

- **Users**: Can view, insert, and update their own data
- **Wallets**: Can view and insert their own wallets
- **Sessions**: Can manage their own sessions
- **Tokens**: Can view their own tokens
- **NFTs**: Can view their own NFTs
- **Message Logs**: Can view their own message logs
- **Errors**: Service role can manage all errors
- **Rate Limits**: Service role can manage all rate limits

## Indexes

- `idx_message_logs_user_id` on `message_logs(user_id)`
- `idx_message_logs_created_at` on `message_logs(created_at)`
- `idx_errors_created_at` on `errors(created_at)`
- `idx_errors_user_id` on `errors(user_id)`
- `idx_rate_limits_user_id` on `rate_limits(user_id)`
- `idx_rate_limits_last_request` on `rate_limits(last_request_at)`

## Functions

- `handle_updated_at()` - Trigger function for updating timestamps
- `get_user_by_phone(phone text)` - Get user by phone number
- `create_user_with_wallet()` - Create user with associated wallet

## Migration Notes

- All migrations are now idempotent with proper `DROP POLICY IF EXISTS` statements
- The schema supports both user authentication and service role access
- Future migrations should follow the same pattern to avoid policy conflicts