-- Create a function to get or create a user by phone number and return their UUID
CREATE OR REPLACE FUNCTION public.get_or_create_user_by_phone(p_phone text)
RETURNS uuid AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Check if user exists
    SELECT id INTO v_user_id FROM public.users WHERE phone_number = p_phone;
    
    -- If user doesn't exist, create one
    IF v_user_id IS NULL THEN
        INSERT INTO public.users (phone_number)
        VALUES (p_phone)
        RETURNING id INTO v_user_id;
    END IF;
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to fix wallets with phone numbers as user_ids
CREATE OR REPLACE FUNCTION public.fix_wallet_user_ids()
RETURNS text AS $$
DECLARE
    v_count int := 0;
    v_wallet record;
    v_user_id uuid;
    v_phone_number text;
BEGIN
    -- Create a temporary table to store wallets with phone numbers as user_ids
    CREATE TEMP TABLE temp_wallets_to_fix AS
    SELECT id, user_id, address
    FROM public.wallets
    WHERE user_id ~ '^[0-9]+$'; -- Simple check for numeric-only user_ids (likely phone numbers)
    
    -- Process each wallet
    FOR v_wallet IN SELECT * FROM temp_wallets_to_fix LOOP
        -- Get phone number from user_id
        v_phone_number := v_wallet.user_id;
        
        -- Get or create user with this phone number
        v_user_id := public.get_or_create_user_by_phone(v_phone_number);
        
        -- Update wallet with correct UUID
        UPDATE public.wallets
        SET user_id = v_user_id
        WHERE id = v_wallet.id;
        
        v_count := v_count + 1;
    END LOOP;
    
    DROP TABLE temp_wallets_to_fix;
    
    RETURN 'Fixed ' || v_count || ' wallets';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the fix function
SELECT public.fix_wallet_user_ids();

-- Create a service role policy to allow direct wallet inserts
CREATE POLICY "Service role can manage all wallets"
    ON public.wallets FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role'); 