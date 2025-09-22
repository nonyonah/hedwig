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
    console.log('Creating pending_transactions table...');
    
    // Create the table with all required columns
    const createTableSQL = `
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
    `;
    
    const { error: createError } = await supabase.rpc('exec_sql', { 
      sql: createTableSQL 
    });
    
    if (createError) {
      console.error('Error creating table:', createError);
      return;
    }
    
    console.log('✓ Table created successfully');
    
    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_pending_transactions_transaction_id ON public.pending_transactions(transaction_id);',
      'CREATE INDEX IF NOT EXISTS idx_pending_transactions_user_id ON public.pending_transactions(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_pending_transactions_status ON public.pending_transactions(status);',
      'CREATE INDEX IF NOT EXISTS idx_pending_transactions_expires_at ON public.pending_transactions(expires_at);'
    ];
    
    for (const indexSQL of indexes) {
      const { error: indexError } = await supabase.rpc('exec_sql', { 
        sql: indexSQL 
      });
      
      if (indexError) {
        console.error('Error creating index:', indexError);
      } else {
        console.log('✓ Index created successfully');
      }
    }
    
    // Create trigger function
    const triggerFunctionSQL = `
      CREATE OR REPLACE FUNCTION public.handle_updated_at()
      RETURNS trigger AS $$
      BEGIN
          new.updated_at = timezone('utc'::text, now());
          RETURN new;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;
    
    const { error: functionError } = await supabase.rpc('exec_sql', { 
      sql: triggerFunctionSQL 
    });
    
    if (functionError) {
      console.error('Error creating function:', functionError);
    } else {
      console.log('✓ Trigger function created successfully');
    }
    
    // Create trigger
    const triggerSQL = `
      CREATE TRIGGER handle_pending_transactions_updated_at
          BEFORE UPDATE ON public.pending_transactions
          FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
    `;
    
    const { error: triggerError } = await supabase.rpc('exec_sql', { 
      sql: triggerSQL 
    });
    
    if (triggerError) {
      console.error('Error creating trigger:', triggerError);
    } else {
      console.log('✓ Trigger created successfully');
    }
    
    console.log('pending_transactions table setup completed!');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createPendingTransactionsTable();