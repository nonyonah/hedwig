-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS check_wallet_user_id_trigger ON public.wallets;
DROP FUNCTION IF EXISTS check_wallet_user_id_exists();

-- Create a new function that creates users if they don't exist
CREATE OR REPLACE FUNCTION check_wallet_user_id_exists_or_create()
RETURNS TRIGGER AS $$
BEGIN
  -- If user doesn't exist, create it
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id::TEXT = NEW.user_id) THEN
    -- Check if it looks like a phone number (simplified check)
    IF NEW.user_id ~ '^\d{10,15}$' THEN
      -- Insert as a phone number
      INSERT INTO public.users (id, phone_number)
      VALUES (gen_random_uuid(), NEW.user_id);
    ELSE
      -- Try to convert to UUID if possible
      BEGIN
        INSERT INTO public.users (id, phone_number)
        VALUES (NEW.user_id::uuid, 'user_' || NEW.user_id);
      EXCEPTION WHEN OTHERS THEN
        -- If conversion fails, create with random UUID
        INSERT INTO public.users (id, phone_number)
        VALUES (gen_random_uuid(), 'user_' || NEW.user_id);
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a new trigger that uses the updated function
CREATE TRIGGER check_wallet_user_id_trigger
  BEFORE INSERT OR UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION check_wallet_user_id_exists_or_create();

-- Update the storeWalletInDb function to handle phone numbers directly
CREATE OR REPLACE FUNCTION create_user_and_wallet(
  p_phone text,
  p_address text,
  p_wallet_type text DEFAULT 'cdp',
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
  ELSE
    -- Create new user
    INSERT INTO public.users (phone_number)
    VALUES (p_phone)
    RETURNING id INTO v_user_id;
  END IF;
  
  -- Update wallet if exists, otherwise create
  IF EXISTS(SELECT 1 FROM public.wallets WHERE user_id = v_user_id::TEXT) THEN
    UPDATE public.wallets 
    SET address = p_address,
        username = p_username,
        wallet_type = p_wallet_type,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id::TEXT
    RETURNING id INTO v_wallet_id;
  ELSE
    INSERT INTO public.wallets (user_id, address, username, wallet_type)
    VALUES (v_user_id::TEXT, p_address, p_username, p_wallet_type)
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
  RAISE EXCEPTION 'Error in create_user_and_wallet: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 