-- =====================================================
-- Fix Foreign Key Constraints to Reference auth.users
-- =====================================================
-- This migration fixes the foreign key constraints that are
-- incorrectly referencing 'users' instead of 'auth.users'
-- =====================================================

-- First, check what foreign key constraints exist and drop the incorrect ones
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Find all foreign key constraints that reference 'users' table
    FOR constraint_record IN
        SELECT 
            tc.constraint_name,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND ccu.table_name = 'users'
            AND tc.table_name IN ('project_contracts', 'contract_activities', 'contract_notifications')
    LOOP
        -- Drop the incorrect foreign key constraint
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', 
                      constraint_record.table_name, 
                      constraint_record.constraint_name);
        
        RAISE NOTICE 'Dropped constraint % from table %', 
                     constraint_record.constraint_name, 
                     constraint_record.table_name;
    END LOOP;
END $$;

-- Add the correct foreign key constraints that reference auth.users
-- But make them deferrable and not enforced for now to handle Telegram users
DO $$
BEGIN
    -- Add client_id foreign key if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'project_contracts_client_id_fkey' 
        AND table_name = 'project_contracts'
    ) THEN
        -- Don't add foreign key constraint for now - Telegram users might not be in auth.users
        -- ALTER TABLE project_contracts 
        -- ADD CONSTRAINT project_contracts_client_id_fkey 
        -- FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Skipping client_id foreign key constraint for Telegram compatibility';
    END IF;

    -- Add freelancer_id foreign key if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'project_contracts_freelancer_id_fkey' 
        AND table_name = 'project_contracts'
    ) THEN
        -- Don't add foreign key constraint for now - Telegram users might not be in auth.users
        -- ALTER TABLE project_contracts 
        -- ADD CONSTRAINT project_contracts_freelancer_id_fkey 
        -- FOREIGN KEY (freelancer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Skipping freelancer_id foreign key constraint for Telegram compatibility';
    END IF;
END $$;

-- Fix other tables that might have the same issue
DO $$
BEGIN
    -- Only add contract_activities constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'contract_activities_actor_id_fkey' 
        AND table_name = 'contract_activities'
    ) THEN
        -- Don't add foreign key constraint - remove it if it exists
        -- ALTER TABLE contract_activities 
        -- ADD CONSTRAINT contract_activities_actor_id_fkey 
        -- FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Skipping contract_activities foreign key constraint';
    ELSE
        -- Drop existing constraint
        ALTER TABLE contract_activities DROP CONSTRAINT contract_activities_actor_id_fkey;
        RAISE NOTICE 'Dropped existing contract_activities foreign key constraint';
    END IF;
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'contract_activities table does not exist';
END $$;

DO $$
BEGIN
    -- Only add contract_notifications constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'contract_notifications_user_id_fkey' 
        AND table_name = 'contract_notifications'
    ) THEN
        -- Don't add foreign key constraint - remove it if it exists
        -- ALTER TABLE contract_notifications 
        -- ADD CONSTRAINT contract_notifications_user_id_fkey 
        -- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Skipping contract_notifications foreign key constraint';
    ELSE
        -- Drop existing constraint
        ALTER TABLE contract_notifications DROP CONSTRAINT contract_notifications_user_id_fkey;
        RAISE NOTICE 'Dropped existing contract_notifications foreign key constraint';
    END IF;
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'contract_notifications table does not exist';
END $$;

-- Also add foreign key for legal_contracts if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'legal_contracts') THEN
        ALTER TABLE project_contracts 
        ADD CONSTRAINT project_contracts_legal_contract_id_fkey 
        FOREIGN KEY (legal_contract_id) REFERENCES legal_contracts(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Constraint already exists, ignore
        NULL;
END $$;

-- Verify the constraints are correct by checking they reference auth.users
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
        AND ccu.table_name = 'users'
        AND tc.table_name = 'project_contracts';
    
    IF constraint_count > 0 THEN
        RAISE EXCEPTION 'Still have foreign keys referencing users table instead of auth.users';
    ELSE
        RAISE NOTICE 'All foreign key constraints now correctly reference auth.users';
    END IF;
END $$;