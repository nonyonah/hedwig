-- Migration for Telegram Integration
-- This migration updates the database schema to support Telegram bot functionality

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

-- Update the user_id format in existing tables to support telegram_ prefix
-- This allows us to use telegram_chat_id as user_id for Telegram users

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
    -- Update existing user's information
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

-- Create telegram_sessions table for managing Telegram bot sessions
CREATE TABLE IF NOT EXISTS public.telegram_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_chat_id BIGINT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  session_data JSONB DEFAULT '{}',
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for telegram_sessions
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat_id ON public.telegram_sessions(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_user_id ON public.telegram_sessions(user_id);

-- Create telegram_message_logs table for logging Telegram interactions
CREATE TABLE IF NOT EXISTS public.telegram_message_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_chat_id BIGINT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  message_type VARCHAR(50) NOT NULL, -- 'text', 'command', 'response', etc.
  content TEXT NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for telegram_message_logs
CREATE INDEX IF NOT EXISTS idx_telegram_message_logs_chat_id ON public.telegram_message_logs(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_message_logs_user_id ON public.telegram_message_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_message_logs_created_at ON public.telegram_message_logs(created_at);

-- Update RLS policies for new tables
ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_message_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for telegram_sessions
CREATE POLICY "Users can view their own telegram sessions" ON public.telegram_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own telegram sessions" ON public.telegram_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own telegram sessions" ON public.telegram_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for telegram_message_logs
CREATE POLICY "Users can view their own telegram message logs" ON public.telegram_message_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage telegram message logs" ON public.telegram_message_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Add comments for documentation
COMMENT ON COLUMN public.users.telegram_chat_id IS 'Telegram chat ID for bot interactions';
COMMENT ON COLUMN public.users.telegram_username IS 'Telegram username (without @)';
COMMENT ON COLUMN public.users.telegram_first_name IS 'Telegram user first name';
COMMENT ON COLUMN public.users.telegram_last_name IS 'Telegram user last name';
COMMENT ON COLUMN public.users.telegram_language_code IS 'Telegram user language code (e.g., en, es)';

COMMENT ON TABLE public.telegram_sessions IS 'Telegram bot session management';
COMMENT ON TABLE public.telegram_message_logs IS 'Log of all Telegram bot interactions';

COMMENT ON FUNCTION public.get_or_create_telegram_user IS 'Get or create user by Telegram chat ID';