-- Add username column to wallets table
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS username text;

-- Add comment explaining the column
COMMENT ON COLUMN public.wallets.username IS 'User''s display name or WhatsApp name';

-- Add wallet_type column if it doesn't exist
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS wallet_type text DEFAULT 'cdp';

-- Add comment explaining the wallet_type column
COMMENT ON COLUMN public.wallets.wallet_type IS 'Type of wallet (cdp, imported, etc.)';

-- Update the create_user_with_wallet function to include username
CREATE OR REPLACE FUNCTION public.create_user_with_wallet(
    p_phone text,
    p_wallet_address text,
    p_private_key_encrypted text,
    p_username text DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_user_id uuid;
    v_wallet_id uuid;
    v_user_exists boolean;
    result json;
BEGIN
    -- Check if user exists
    SELECT exists(SELECT 1 FROM public.users WHERE phone_number = p_phone) INTO v_user_exists;
    
    IF v_user_exists THEN
        -- Get existing user
        SELECT id INTO v_user_id FROM public.users WHERE phone_number = p_phone;
        
        -- Update wallet if exists, otherwise create
        IF EXISTS(SELECT 1 FROM public.wallets WHERE user_id = v_user_id::TEXT) THEN
            UPDATE public.wallets 
            SET address = p_wallet_address,
                private_key_encrypted = p_private_key_encrypted,
                username = p_username,
                updated_at = timezone('utc'::text, now())
            WHERE user_id = v_user_id::TEXT
            RETURNING id INTO v_wallet_id;
        ELSE
            INSERT INTO public.wallets (user_id, address, private_key_encrypted, username)
            VALUES (v_user_id::TEXT, p_wallet_address, p_private_key_encrypted, p_username)
            RETURNING id INTO v_wallet_id;
        END IF;
    ELSE
        -- Create new user
        INSERT INTO public.users (phone_number)
        VALUES (p_phone)
        RETURNING id INTO v_user_id;
        
        -- Create wallet
        INSERT INTO public.wallets (user_id, address, private_key_encrypted, username)
        VALUES (v_user_id::TEXT, p_wallet_address, p_private_key_encrypted, p_username)
        RETURNING id INTO v_wallet_id;
    END IF;
    
    -- Return the user with wallet info
    SELECT json_build_object(
        'user', to_json(u.*),
        'wallet', to_json(w.*)
    ) INTO result
    FROM public.users u
    LEFT JOIN public.wallets w ON w.user_id = u.id::TEXT
    WHERE u.id = v_user_id;
    
    RETURN result;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in create_user_with_wallet: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 