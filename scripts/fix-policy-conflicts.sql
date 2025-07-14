-- Script to fix RLS policy conflicts during migration
-- Run this before applying migrations if you encounter policy conflicts

-- Drop all existing RLS policies that might conflict
-- Users table policies
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own data" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Users can read their own data" ON public.users;

-- Wallets table policies
DROP POLICY IF EXISTS "Users can view their own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can insert their own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can update their own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Service role can manage wallets" ON public.wallets;

-- Sessions table policies
DROP POLICY IF EXISTS "Users can manage their own sessions" ON public.sessions;

-- Tokens table policies
DROP POLICY IF EXISTS "Users can view their own tokens" ON public.tokens;

-- NFTs table policies
DROP POLICY IF EXISTS "Users can view their own NFTs" ON public.nfts;

-- Message logs table policies
DROP POLICY IF EXISTS "Users can view their own message logs" ON public.message_logs;

-- Errors table policies
DROP POLICY IF EXISTS "Service role can manage all errors" ON public.errors;

-- Rate limits table policies
DROP POLICY IF EXISTS "Service role can manage all rate limits" ON public.rate_limits;

-- Now recreate the essential policies
-- Users policies
CREATE POLICY "Users can view their own data"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own data"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own data"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Wallets policies with service role access
CREATE POLICY "Users can view their own wallets"
    ON public.wallets FOR SELECT
    USING (auth.uid()::TEXT = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own wallets"
    ON public.wallets FOR INSERT
    WITH CHECK (auth.uid()::TEXT = user_id OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage wallets"
    ON public.wallets FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Sessions policies
CREATE POLICY "Users can manage their own sessions"
    ON public.sessions FOR ALL
    USING (auth.uid() = user_id OR auth.role() = 'service_role')
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- Other essential policies
CREATE POLICY "Users can view their own tokens"
    ON public.tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own NFTs"
    ON public.nfts FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can view their own message logs"
    ON public.message_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all errors"
    ON public.errors FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all rate limits"
    ON public.rate_limits FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Add comment
COMMENT ON SCHEMA public IS 'RLS policies reset and recreated to fix conflicts';