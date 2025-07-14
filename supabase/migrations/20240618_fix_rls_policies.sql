-- Fix RLS policies for users and wallets tables
-- This migration ensures that the service role can create and access users and wallets

-- First, check if RLS is enabled for these tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'wallets');

-- Enable RLS on tables if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow service role full access to users" ON public.users;
DROP POLICY IF EXISTS "Allow service role full access to wallets" ON public.wallets;
DROP POLICY IF EXISTS "Allow users to see their own data" ON public.users;
DROP POLICY IF EXISTS "Allow users to see their own wallets" ON public.wallets;

-- Create policies that allow the service role to perform all operations
CREATE POLICY "Allow service role full access to users"
  ON public.users
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to wallets"
  ON public.wallets
  USING (true)
  WITH CHECK (true);

-- Create policies that allow users to see only their own data
CREATE POLICY "Allow users to see their own data"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Allow users to see their own wallets"
  ON public.wallets
  FOR SELECT
  USING (auth.uid()::TEXT = user_id);

-- Grant necessary privileges to the service role
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.wallets TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Ensure the authenticated role can access its own data
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.wallets TO authenticated;

-- Verify the policies
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename IN ('users', 'wallets');