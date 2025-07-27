-- Telegram Integration Migration
-- Apply this SQL in your Supabase SQL Editor

-- Add Telegram-related columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE,
ADD COLUMN IF NOT EXISTS telegram_username TEXT,
ADD COLUMN IF NOT EXISTS telegram_first_name TEXT,
ADD COLUMN IF NOT EXISTS telegram_last_name TEXT,
ADD COLUMN IF NOT EXISTS telegram_language_code TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON public.users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_username ON public.users(telegram_username);

-- Create function to get or create Telegram user
CREATE OR REPLACE FUNCTION public.get_or_create_telegram_user(
  p_telegram_chat_id BIGINT,
  p_telegram_username TEXT DEFAULT NULL,
  p_telegram_first_name TEXT DEFAULT NULL,
  p_telegram_last_name TEXT DEFAULT NULL,
  p_telegram_language_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Try to find existing user by telegram_chat_id
  SELECT id INTO user_id
  FROM public.users
  WHERE telegram_chat_id = p_telegram_chat_id;
  
  IF user_id IS NULL THEN
    -- Create new user
    INSERT INTO public.users (
      telegram_chat_id,
      telegram_username,
      telegram_first_name,
      telegram_last_name,
      telegram_language_code,
      created_at,
      updated_at
    ) VALUES (
      p_telegram_chat_id,
      p_telegram_username,
      p_telegram_first_name,
      p_telegram_last_name,
      p_telegram_language_code,
      NOW(),
      NOW()
    ) RETURNING id INTO user_id;
  ELSE
    -- Update existing user with latest Telegram info
    UPDATE public.users SET
      telegram_username = COALESCE(p_telegram_username, telegram_username),
      telegram_first_name = COALESCE(p_telegram_first_name, telegram_first_name),
      telegram_last_name = COALESCE(p_telegram_last_name, telegram_last_name),
      telegram_language_code = COALESCE(p_telegram_language_code, telegram_language_code),
      updated_at = NOW()
    WHERE id = user_id;
  END IF;
  
  RETURN user_id;
END;
$$;

-- Create telegram_sessions table
CREATE TABLE IF NOT EXISTS public.telegram_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  session_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Create indexes for telegram_sessions
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_user_id ON public.telegram_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat_id ON public.telegram_sessions(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_expires_at ON public.telegram_sessions(expires_at);

-- Create telegram_message_logs table
CREATE TABLE IF NOT EXISTS public.telegram_message_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for telegram_message_logs
CREATE INDEX IF NOT EXISTS idx_telegram_message_logs_user_id ON public.telegram_message_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_message_logs_chat_id ON public.telegram_message_logs(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_message_logs_created_at ON public.telegram_message_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_message_logs_direction ON public.telegram_message_logs(direction);

-- Enable Row Level Security (RLS)
ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_message_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for telegram_sessions
CREATE POLICY "Users can view their own telegram sessions" ON public.telegram_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own telegram sessions" ON public.telegram_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own telegram sessions" ON public.telegram_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own telegram sessions" ON public.telegram_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for telegram_message_logs
CREATE POLICY "Users can view their own telegram message logs" ON public.telegram_message_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own telegram message logs" ON public.telegram_message_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.telegram_sessions TO anon, authenticated;
GRANT ALL ON public.telegram_message_logs TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_telegram_user TO anon, authenticated;