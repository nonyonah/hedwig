-- Add email column to the users table
ALTER TABLE public.users
ADD COLUMN email TEXT;

-- Add a unique constraint to the email column to prevent duplicates
ALTER TABLE public.users
ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Optional: Add a comment to the new column for clarity
COMMENT ON COLUMN public.users.email IS 'The user''s unique email address, used for login and notifications.';
