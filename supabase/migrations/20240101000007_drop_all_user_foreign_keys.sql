-- =====================================================
-- Drop All Foreign Key Constraints to Users Tables
-- =====================================================
-- This migration drops all foreign key constraints that reference
-- users tables to avoid constraint violations with Telegram users
-- =====================================================

-- Drop all foreign key constraints that might be causing issues
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Find and drop all foreign key constraints that reference 'users' or 'auth.users'
    FOR constraint_record IN
        SELECT 
            tc.constraint_name,
            tc.table_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND (ccu.table_name = 'users' OR ccu.table_name = 'auth.users')
            AND tc.table_name IN ('project_contracts', 'contract_activities', 'contract_notifications', 'contract_milestones', 'contract_extension_requests')
    LOOP
        BEGIN
            -- Drop the foreign key constraint
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', 
                          constraint_record.table_name, 
                          constraint_record.constraint_name);
            
            RAISE NOTICE 'Dropped constraint % from table %', 
                         constraint_record.constraint_name, 
                         constraint_record.table_name;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop constraint % from table %: %', 
                             constraint_record.constraint_name, 
                             constraint_record.table_name,
                             SQLERRM;
        END;
    END LOOP;
END $$;

-- Also drop specific constraints by name if they exist
DO $$
BEGIN
    -- Drop project_contracts foreign keys
    ALTER TABLE project_contracts DROP CONSTRAINT IF EXISTS project_contracts_client_id_fkey;
    ALTER TABLE project_contracts DROP CONSTRAINT IF EXISTS project_contracts_freelancer_id_fkey;
    
    -- Drop contract_activities foreign keys
    ALTER TABLE contract_activities DROP CONSTRAINT IF EXISTS contract_activities_actor_id_fkey;
    
    -- Drop contract_notifications foreign keys
    ALTER TABLE contract_notifications DROP CONSTRAINT IF EXISTS contract_notifications_user_id_fkey;
    
    RAISE NOTICE 'Dropped all known user foreign key constraints';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Some tables do not exist, skipping constraint drops';
    WHEN undefined_object THEN
        RAISE NOTICE 'Some constraints do not exist, skipping';
END $$;

-- Verify no foreign key constraints remain that reference users tables
DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND (ccu.table_name = 'users' OR ccu.table_name = 'auth.users')
        AND tc.table_name IN ('project_contracts', 'contract_activities', 'contract_notifications');
    
    IF constraint_count > 0 THEN
        RAISE NOTICE 'Warning: % foreign key constraints still reference users tables', constraint_count;
    ELSE
        RAISE NOTICE 'Success: No foreign key constraints reference users tables';
    END IF;
END $$;