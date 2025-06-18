// Script to apply RLS policy fixes directly through the Supabase client
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Ensure environment variables are loaded
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or service key. Please check your .env file.');
  process.exit(1);
}

// Create a Supabase client with the service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyRLSFixes() {
  console.log('Starting RLS policy fix application...');
  
  try {
    // Read the SQL migration file
    const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20240618_fix_rls_policies.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('SQL migration file loaded successfully.');
    console.log('Applying RLS policy fixes...');
    
    // Split the SQL into separate statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    // Execute each statement
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        console.error(`Error executing statement: ${error.message}`);
        console.error('Statement:', statement);
      }
    }
    
    console.log('RLS policy fixes applied successfully!');
    
    // Verify the policies
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: `SELECT tablename, policyname FROM pg_policies 
            WHERE schemaname = 'public' AND tablename IN ('users', 'wallets')` 
    });
    
    if (error) {
      console.error('Error verifying policies:', error);
    } else {
      console.log('Current policies:', data);
    }
    
  } catch (error) {
    console.error('Error applying RLS fixes:', error);
    process.exit(1);
  }
}

// Run the function
applyRLSFixes().catch(console.error); 