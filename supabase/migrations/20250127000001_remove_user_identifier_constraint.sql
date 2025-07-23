-- Remove NOT NULL constraint from user_identifier column
-- This allows the application to use user_id instead of user_identifier

-- Make user_identifier nullable since we're now using user_id
ALTER TABLE proposals ALTER COLUMN user_identifier DROP NOT NULL;

-- Add a comment to clarify the column is deprecated
COMMENT ON COLUMN proposals.user_identifier IS 'DEPRECATED: This column is no longer used. Use user_id instead for proper foreign key relationship.';