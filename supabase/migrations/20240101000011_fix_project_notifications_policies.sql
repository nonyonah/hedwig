-- Fix project notifications policies to avoid type casting issues
-- Only proceed if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'project_notifications') THEN
    -- Drop existing policies first
    DROP POLICY IF EXISTS "Service role can manage project notifications" ON project_notifications;
    DROP POLICY IF EXISTS "Users can view their project notifications" ON project_notifications;
    DROP POLICY IF EXISTS "Authenticated users can view project notifications" ON project_notifications;
    DROP POLICY IF EXISTS "Service role can insert project notifications" ON project_notifications;
    DROP POLICY IF EXISTS "Service role can update project notifications" ON project_notifications;
  END IF;
END $$;

-- Create simpler policies that avoid complex joins (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'project_notifications') THEN
    -- Create simpler policies
    CREATE POLICY "Service role can manage project notifications" ON project_notifications
      FOR ALL USING (auth.role() = 'service_role');

    -- Allow authenticated users to view all notifications (simplified for now)
    -- In production, you might want to restrict this further
    CREATE POLICY "Authenticated users can view project notifications" ON project_notifications
      FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

    -- Allow service role to insert notifications
    CREATE POLICY "Service role can insert project notifications" ON project_notifications
      FOR INSERT WITH CHECK (auth.role() = 'service_role');

    -- Allow service role to update notifications
    CREATE POLICY "Service role can update project notifications" ON project_notifications
      FOR UPDATE USING (auth.role() = 'service_role');
  END IF;
END $$;