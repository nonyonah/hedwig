import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createPendingTransactionsTable() {
  try {
    console.log('Checking if pending_transactions table exists...');
    
    // First, let's check if the table exists by trying to query it
    const { data, error } = await supabase
      .from('pending_transactions')
      .select('*')
      .limit(1);
    
    if (error && error.code === 'PGRST116') {
      console.log('Table does not exist. Please create it manually in Supabase dashboard.');
      console.log('Use this SQL in the Supabase SQL editor:');
      console.log(`
-- Create the pending_transactions table for transaction storage
CREATE TABLE IF NOT EXISTS public.pending_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id varchar(255) UNIQUE NOT NULL,
    user_id text NOT NULL,
    from_address varchar(255) NOT NULL,
    to_address varchar(255) NOT NULL,
    amount decimal(20, 8) NOT NULL,
    token_symbol varchar(10) NOT NULL,
    token_address varchar(255),
    network varchar(50) NOT NULL,
    status varchar(50) DEFAULT 'pending',
    transaction_hash varchar(255),
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pending_transactions_transaction_id 
ON public.pending_transactions(transaction_id);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_user_id 
ON public.pending_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_status 
ON public.pending_transactions(status);

CREATE INDEX IF NOT EXISTS idx_pending_transactions_expires_at 
ON public.pending_transactions(expires_at);

-- Add trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER handle_pending_transactions_updated_at
    BEFORE UPDATE ON public.pending_transactions
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Enable RLS on the table
ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;
      `);
    } else if (error) {
      console.error('Error checking table:', error);
    } else {
      console.log('✓ Table already exists!');
      
      // Check if required columns exist
      const { data: tableData, error: tableError } = await supabase
        .from('pending_transactions')
        .select('created_at, expires_at')
        .limit(1);
      
      if (tableError && tableError.message.includes('created_at')) {
        console.log('❌ created_at column is missing');
      } else if (tableError && tableError.message.includes('expires_at')) {
        console.log('❌ expires_at column is missing');
      } else {
        console.log('✓ All required columns exist');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createPendingTransactionsTable();