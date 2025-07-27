-- Ensure last_active column exists in users table
-- This fixes the "column last_active does not exist" error

-- Add last_active column if it doesn't exist
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add Telegram-specific columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE,
ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS telegram_first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS telegram_last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS telegram_language_code VARCHAR(10);

-- Create index for telegram_chat_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON public.users(telegram_chat_id);

-- Create index for telegram_username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_telegram_username ON public.users(telegram_username);

-- Create a function to get or create user by telegram chat ID
CREATE OR REPLACE FUNCTION public.get_or_create_telegram_user(
  p_telegram_chat_id BIGINT,
  p_telegram_username VARCHAR(255) DEFAULT NULL,
  p_telegram_first_name VARCHAR(255) DEFAULT NULL,
  p_telegram_last_name VARCHAR(255) DEFAULT NULL,
  p_telegram_language_code VARCHAR(10) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
  phone_placeholder VARCHAR(20);
BEGIN
  -- Try to find existing user by telegram_chat_id
  SELECT id INTO user_uuid
  FROM public.users
  WHERE telegram_chat_id = p_telegram_chat_id;
  
  -- If user doesn't exist, create a new one
  IF user_uuid IS NULL THEN
    -- Generate a placeholder phone number for Telegram users
    phone_placeholder := 'telegram_' || p_telegram_chat_id::text;
    
    INSERT INTO public.users (
      phone_number,
      telegram_chat_id,
      telegram_username,
      telegram_first_name,
      telegram_last_name,
      telegram_language_code,
      created_at,
      last_active
    ) VALUES (
      phone_placeholder,
      p_telegram_chat_id,
      p_telegram_username,
      p_telegram_first_name,
      p_telegram_last_name,
      p_telegram_language_code,
      NOW(),
      NOW()
    )
    RETURNING id INTO user_uuid;
  ELSE
    -- Update existing user's information and last_active timestamp
    UPDATE public.users SET
      telegram_username = COALESCE(p_telegram_username, telegram_username),
      telegram_first_name = COALESCE(p_telegram_first_name, telegram_first_name),
      telegram_last_name = COALESCE(p_telegram_last_name, telegram_last_name),
      telegram_language_code = COALESCE(p_telegram_language_code, telegram_language_code),
      last_active = NOW()
    WHERE id = user_uuid;
  END IF;
  
  RETURN user_uuid;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_telegram_user TO anon, authenticated, service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_or_create_telegram_user IS 'Get or create user by Telegram chat ID, using phone_number field and last_active timestamp';