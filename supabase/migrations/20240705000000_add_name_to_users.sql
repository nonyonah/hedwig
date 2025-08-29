-- Add name column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Update RLS policies to include name
DROP POLICY IF EXISTS "Users can read their own data" ON public.users;
CREATE POLICY "Users can read their own data" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
CREATE POLICY "Users can update their own data" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id);

-- Create index for faster name lookups
CREATE INDEX IF NOT EXISTS idx_users_name ON public.users (name);

-- Update get_or_create_user function to handle name
CREATE OR REPLACE FUNCTION public.get_or_create_user(
  p_phone TEXT,
  p_name TEXT DEFAULT NULL
) 
RETURNS UUID AS $$
DECLARE
  v_user_exists BOOLEAN;
  v_user_id UUID;
BEGIN
  -- Check if user exists
  SELECT EXISTS(SELECT 1 FROM public.users WHERE phone_number = p_phone) INTO v_user_exists;
  
  IF v_user_exists THEN
    -- Get existing user
    SELECT id INTO v_user_id FROM public.users WHERE phone_number = p_phone;
    
    -- Update name if provided and different
    IF p_name IS NOT NULL THEN
      UPDATE public.users 
      SET name = p_name 
      WHERE id = v_user_id AND (name IS NULL OR name != p_name);
    END IF;
  ELSE
    -- Create new user
    INSERT INTO public.users (phone_number, name, created_at, updated_at)
    VALUES (p_phone, p_name, NOW(), NOW())
    RETURNING id INTO v_user_id;
  END IF;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to explain the column
COMMENT ON COLUMN public.users.name IS 'User''s display name, can be from WhatsApp or manually provided';