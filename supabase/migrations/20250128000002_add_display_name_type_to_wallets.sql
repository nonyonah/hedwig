-- Add display_name_type column to wallets table
ALTER TABLE public.wallets 
ADD COLUMN IF NOT EXISTS display_name_type TEXT DEFAULT 'custom';

-- Add comment for the new column
COMMENT ON COLUMN public.wallets.display_name_type IS 'Type of display name: telegram_username, email, or custom';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_wallets_display_name_type ON public.wallets(display_name_type);

-- Update existing wallets to set display_name_type based on username pattern
-- Only run this if the username column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'wallets' 
    AND column_name = 'username'
  ) THEN
    UPDATE public.wallets 
    SET display_name_type = CASE 
      WHEN username LIKE '@%' THEN 'telegram_username'
      WHEN username LIKE '%@%.%' THEN 'email'
      ELSE 'custom'
    END
    WHERE username IS NOT NULL;
  END IF;
END $$;