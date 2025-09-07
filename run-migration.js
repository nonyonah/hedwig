import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  try {
    console.log('Running offramp_transactions migration...');
    
    // Execute the key migration statements one by one
     const statements = [
       'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid() PRIMARY KEY',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS paycrest_order_id VARCHAR(255)',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS receive_address VARCHAR(255)',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255)',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(255)',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS error_message TEXT',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS error_step VARCHAR(100)',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE',
      'ALTER TABLE offramp_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()'
    ];
    
    for (const statement of statements) {
      console.log('Executing:', statement);
      const { error } = await supabase.from('_temp').select('1').limit(0); // Test connection
      
      if (error && error.code !== 'PGRST116') {
        console.error('Connection error:', error);
        return;
      }
      
      // Use raw SQL query
      const { error: sqlError } = await supabase.rpc('exec_raw_sql', { query: statement });
      
      if (sqlError) {
        console.error('Error executing statement:', sqlError);
        console.error('Statement was:', statement);
      } else {
        console.log('✓ Statement executed successfully');
      }
    }
    
    console.log('Migration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

runMigration();