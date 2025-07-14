-- Enable UUID extension
create extension if not exists "uuid-ossp" with schema public;

-- Users table
create table if not exists public.users (
    id uuid default gen_random_uuid() primary key,
    phone_number text not null unique,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    last_active timestamp with time zone,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Wallets table
create table if not exists public.wallets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    address text not null unique,
    private_key_encrypted text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Sessions table
create table if not exists public.sessions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    token text not null unique,
    expires_at timestamp with time zone not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tokens table
create table if not exists public.tokens (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    token_address text not null,
    symbol text not null,
    name text not null,
    balance text not null,
    decimals integer not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id, token_address)
);

-- NFTs table
create table if not exists public.nfts (
    id uuid default gen_random_uuid() primary key,
    token_id text not null,
    contract_address text not null,
    owner_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    description text,
    image_url text,
    metadata jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(contract_address, token_id, owner_id)
);

-- Message logs table
create table if not exists public.message_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    message_type text not null,
    content text not null,
    direction text not null check (direction in ('incoming', 'outgoing')),
    metadata jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Errors table
create table if not exists public.errors (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete set null,
    error_type text not null,
    error_message text not null,
    stack_trace text,
    metadata jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Rate limits table
create table if not exists public.rate_limits (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    request_count integer not null default 1,
    first_request_at timestamp with time zone not null default timezone('utc'::text, now()),
    last_request_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id)
);

-- Indexes for better query performance
create index idx_message_logs_user_id on public.message_logs(user_id);
create index idx_message_logs_created_at on public.message_logs(created_at);
create index idx_errors_created_at on public.errors(created_at);
create index idx_errors_user_id on public.errors(user_id);
create index idx_rate_limits_user_id on public.rate_limits(user_id);
create index idx_rate_limits_last_request on public.rate_limits(last_request_at);

-- Row Level Security (RLS) policies
-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.wallets enable row level security;
alter table public.sessions enable row level security;
alter table public.tokens enable row level security;
alter table public.nfts enable row level security;
alter table public.message_logs enable row level security;
alter table public.errors enable row level security;
alter table public.rate_limits enable row level security;

-- Users RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own data" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;

create policy "Users can view their own data"
    on public.users for select
    using (auth.uid() = id);

create policy "Users can insert their own data"
    on public.users for insert
    with check (auth.uid() = id);

create policy "Users can update their own data"
    on public.users for update
    using (auth.uid() = id);

-- Wallets RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can insert their own wallets" ON public.wallets;

create policy "Users can view their own wallets"
    on public.wallets for select
    using (auth.uid()::TEXT = user_id);

create policy "Users can insert their own wallets"
    on public.wallets for insert
    with check (auth.uid()::TEXT = user_id);

-- Sessions RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can manage their own sessions" ON public.sessions;

create policy "Users can manage their own sessions"
    on public.sessions for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Tokens RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own tokens" ON public.tokens;

create policy "Users can view their own tokens"
    on public.tokens for select
    using (auth.uid() = user_id);

-- NFTs RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own NFTs" ON public.nfts;

create policy "Users can view their own NFTs"
    on public.nfts for select
    using (auth.uid() = owner_id);

-- Message logs RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own message logs" ON public.message_logs;

create policy "Users can view their own message logs"
    on public.message_logs for select
    using (auth.uid() = user_id);

-- Errors RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Service role can manage all errors" ON public.errors;

create policy "Service role can manage all errors"
    on public.errors for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- Rate limits RLS policies
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Service role can manage all rate limits" ON public.rate_limits;

create policy "Service role can manage all rate limits"
    on public.rate_limits for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- Functions for updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql security definer;

-- Triggers for updated_at
create trigger handle_users_updated_at
    before update on public.users
    for each row execute procedure public.handle_updated_at();

create trigger handle_wallets_updated_at
    before update on public.wallets
    for each row execute procedure public.handle_updated_at();

create trigger handle_sessions_updated_at
    before update on public.sessions
    for each row execute procedure public.handle_updated_at();

create trigger handle_tokens_updated_at
    before update on public.tokens
    for each row execute procedure public.handle_updated_at();

create trigger handle_nfts_updated_at
    before update on public.nfts
    for each row execute procedure public.handle_updated_at();

create trigger handle_rate_limits_updated_at
    before update on public.rate_limits
    for each row execute procedure public.handle_updated_at();

-- Function to get user by phone number
create or replace function public.get_user_by_phone(phone text)
returns json as $$
    select to_json(u) from public.users u where u.phone_number = phone limit 1;
$$ language sql security definer;

-- Function to create a new user with a wallet if they don't exist
create or replace function public.create_user_with_wallet(
    p_phone text,
    p_wallet_address text,
    p_private_key_encrypted text
) returns json as $$
declare
    v_user_id uuid;
    v_wallet_id uuid;
    v_user_exists boolean;
    result json;
begin
    -- Check if user exists
    select exists(select 1 from public.users where phone_number = p_phone) into v_user_exists;
    
    if v_user_exists then
        -- Get existing user
        select id into v_user_id from public.users where phone_number = p_phone;
        
        -- Update wallet if exists, otherwise create
        if exists(select 1 from public.wallets where user_id = v_user_id) then
            update public.wallets 
            set address = p_wallet_address,
                private_key_encrypted = p_private_key_encrypted,
                updated_at = timezone('utc'::text, now())
            where user_id = v_user_id
            returning id into v_wallet_id;
        else
            insert into public.wallets (user_id, address, private_key_encrypted)
            values (v_user_id, p_wallet_address, p_private_key_encrypted)
            returning id into v_wallet_id;
        end if;
    else
        -- Create new user
        insert into public.users (phone_number)
        values (p_phone)
        returning id into v_user_id;
        
        -- Create wallet
        insert into public.wallets (user_id, address, private_key_encrypted)
        values (v_user_id, p_wallet_address, p_private_key_encrypted)
        returning id into v_wallet_id;
    end if;
    
    -- Return the user with wallet info
    select json_build_object(
        'user', to_json(u.*),
        'wallet', to_json(w.*)
    ) into result
    from public.users u
    left join public.wallets w on w.user_id = u.id
    where u.id = v_user_id;
    
    return result;
exception when others then
    raise exception 'Error in create_user_with_wallet: %', sqlerrm;
end;
$$ language plpgsql security definer;
