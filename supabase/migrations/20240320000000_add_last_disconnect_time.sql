-- Add last_disconnect_time column to profiles table
ALTER TABLE profiles
ADD COLUMN last_disconnect_time BIGINT; 