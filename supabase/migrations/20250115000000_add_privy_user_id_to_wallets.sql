-- Add privy_user_id column to wallets table
-- This column is needed for session management and Privy integration
-- Migration is idempotent and can be run multiple times safely

-- Check if column already exists to avoid conflicts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'wallets' 
        AND column_name = 'privy_user_id'
    ) THEN
        ALTER TABLE public.wallets ADD COLUMN privy_user_id text;
        RAISE NOTICE 'Added privy_user_id column to wallets table';
    ELSE
        RAISE NOTICE 'privy_user_id column already exists in wallets table';
    END IF;
END $$;

-- Add comment explaining the column
COMMENT ON COLUMN public.wallets.privy_user_id IS 'Privy user ID for session management and authentication';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallets_privy_user_id ON public.wallets (privy_user_id);

-- Update the create_user_with_wallet function to include privy_user_id
CREATE OR REPLACE FUNCTION public.create_user_with_wallet(
    p_phone text,
    p_wallet_address text,
    p_private_key_encrypted text,
    p_username text DEFAULT NULL,
    p_privy_user_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_wallet_id uuid;
    v_result json;
BEGIN
    -- Check if user exists by phone
    SELECT id INTO v_user_id
    FROM public.users
    WHERE phone_number = p_phone;
    
    IF v_user_id IS NOT NULL THEN
        -- User exists, check if wallet exists
        IF EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id AND address = p_wallet_address) THEN
            -- Update existing wallet with new data
            UPDATE public.wallets
            SET 
                private_key_encrypted = p_private_key_encrypted,
                username = COALESCE(p_username, username),
                privy_user_id = COALESCE(p_privy_user_id, privy_user_id),
                updated_at = timezone('utc'::text, now())
            WHERE user_id = v_user_id AND address = p_wallet_address
            RETURNING id INTO v_wallet_id;
        ELSE
            -- Create new wallet for existing user
            INSERT INTO public.wallets (user_id, address, private_key_encrypted, username, privy_user_id)
            VALUES (v_user_id, p_wallet_address, p_private_key_encrypted, p_username, p_privy_user_id)
            RETURNING id INTO v_wallet_id;
        END IF;
    ELSE
        -- Create new user
        INSERT INTO public.users (phone_number)
        VALUES (p_phone)
        RETURNING id INTO v_user_id;
        
        -- Create wallet for new user
        INSERT INTO public.wallets (user_id, address, private_key_encrypted, username, privy_user_id)
        VALUES (v_user_id, p_wallet_address, p_private_key_encrypted, p_username, p_privy_user_id)
        RETURNING id INTO v_wallet_id;
    END IF;
    
    -- Return the result
    SELECT json_build_object(
        'user_id', v_user_id,
        'wallet_id', v_wallet_id,
        'wallet_address', p_wallet_address
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- Update RLS policies to allow service role access for session management
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Service role can manage wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can view their own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can insert their own wallets" ON public.wallets;

-- Recreate wallet policies with service role access
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