-- First drop the policies that depend on the user_id column
DROP POLICY IF EXISTS "Users can view their own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can insert their own wallets" ON public.wallets;

-- Drop the foreign key constraint
ALTER TABLE public.wallets
  DROP CONSTRAINT IF EXISTS wallets_user_id_fkey;

-- Change the user_id column type in wallets table from UUID to TEXT
ALTER TABLE public.wallets 
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Add comment explaining the change
COMMENT ON COLUMN public.wallets.user_id IS 'User ID in text format (typically UUID as string or phone number)';

-- Recreate any indexes on the user_id column
DROP INDEX IF EXISTS wallets_user_id_idx;
CREATE INDEX wallets_user_id_idx ON public.wallets(user_id); 

-- Create a function to validate that user_id exists in users table
CREATE OR REPLACE FUNCTION check_wallet_user_id_exists()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id::TEXT = NEW.user_id) THEN
    RAISE EXCEPTION 'User ID % does not exist in users table', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to validate user_id on insert/update
DROP TRIGGER IF EXISTS check_wallet_user_id_trigger ON public.wallets;
CREATE TRIGGER check_wallet_user_id_trigger
  BEFORE INSERT OR UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION check_wallet_user_id_exists();

-- Recreate the policies with the new column type
CREATE POLICY "Users can view their own wallets"
    ON public.wallets FOR SELECT
    USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert their own wallets"
    ON public.wallets FOR INSERT
    WITH CHECK (auth.uid()::TEXT = user_id);

-- Update the create_user_with_wallet function to handle TEXT user_id
CREATE OR REPLACE FUNCTION public.create_user_with_wallet(
    p_phone text,
    p_wallet_address text,
    p_private_key_encrypted text
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
                updated_at = timezone('utc'::text, now())
            WHERE user_id = v_user_id::TEXT
            RETURNING id INTO v_wallet_id;
        ELSE
            INSERT INTO public.wallets (user_id, address, private_key_encrypted)
            VALUES (v_user_id::TEXT, p_wallet_address, p_private_key_encrypted)
            RETURNING id INTO v_wallet_id;
        END IF;
    ELSE
        -- Create new user
        INSERT INTO public.users (phone_number)
        VALUES (p_phone)
        RETURNING id INTO v_user_id;
        
        -- Create wallet
        INSERT INTO public.wallets (user_id, address, private_key_encrypted)
        VALUES (v_user_id::TEXT, p_wallet_address, p_private_key_encrypted)
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