// Script to create wallet_creation_attempts and wallet_prompts tables
// Run with: node scripts/apply-wallet-tables.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or service role key. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createWalletTables() {
  console.log('Creating wallet_creation_attempts and wallet_prompts tables...');

  try {
    // Create wallet_creation_attempts table
    const { error: attemptsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.wallet_creation_attempts (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text NOT NULL,
          last_attempt_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
          attempt_count integer DEFAULT 1 NOT NULL,
          created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
          updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_wallet_creation_attempts_user_id ON public.wallet_creation_attempts(user_id);
        
        ALTER TABLE public.wallet_creation_attempts ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY "Service role can manage all wallet creation attempts"
          ON public.wallet_creation_attempts FOR ALL
          USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');
      `
    });

    if (attemptsError) {
      console.error('Error creating wallet_creation_attempts table:', attemptsError);
      
      // Try alternative approach if RPC fails
      const { error: directError } = await supabase.from('_exec_sql').select('*').eq('query', `
        CREATE TABLE IF NOT EXISTS public.wallet_creation_attempts (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text NOT NULL,
          last_attempt_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
          attempt_count integer DEFAULT 1 NOT NULL,
          created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
          updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
        );
      `);
      
      if (directError) {
        console.error('Direct SQL execution also failed:', directError);
      }
    } else {
      console.log('Successfully created wallet_creation_attempts table');
    }

    // Create wallet_prompts table
    const { error: promptsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.wallet_prompts (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text NOT NULL,
          prompt_shown boolean DEFAULT false NOT NULL,
          shown_at timestamp with time zone,
          created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
          updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_wallet_prompts_user_id ON public.wallet_prompts(user_id);
        
        ALTER TABLE public.wallet_prompts ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY "Service role can manage all wallet prompts"
          ON public.wallet_prompts FOR ALL
          USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');
      `
    });

    if (promptsError) {
      console.error('Error creating wallet_prompts table:', promptsError);
    } else {
      console.log('Successfully created wallet_prompts table');
    }

    console.log('Database setup completed');
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the function
createWalletTables()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 