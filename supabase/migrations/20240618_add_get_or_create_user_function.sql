-- Function to get or create a user by phone number
CREATE OR REPLACE FUNCTION public.get_or_create_user(p_phone text)
RETURNS uuid AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Check if user exists
    SELECT id INTO v_user_id FROM public.users WHERE phone_number = p_phone;
    
    -- If user doesn't exist, create one
    IF v_user_id IS NULL THEN
        INSERT INTO public.users (phone_number, created_at, updated_at)
        VALUES (p_phone, NOW(), NOW())
        RETURNING id INTO v_user_id;
    END IF;
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger function to validate user_id exists
CREATE OR REPLACE FUNCTION public.check_wallet_user_id_exists()
RETURNS TRIGGER AS $trigger_func$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id::TEXT = NEW.user_id) THEN
        RAISE EXCEPTION 'User ID % does not exist in users table', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$trigger_func$ LANGUAGE plpgsql;

-- Create the trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'check_wallet_user_id_trigger'
    ) THEN
        CREATE TRIGGER check_wallet_user_id_trigger
        BEFORE INSERT OR UPDATE ON public.wallets
        FOR EACH ROW
        EXECUTE FUNCTION public.check_wallet_user_id_exists();
    END IF;
END $$;

-- Add a policy to allow service role to create users
DO $$
BEGIN
    -- Check if the policy exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE policyname = 'Service role can manage all users'
    ) THEN
        -- Create the policy if it doesn't exist
        CREATE POLICY "Service role can manage all users"
            ON public.users FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$; 