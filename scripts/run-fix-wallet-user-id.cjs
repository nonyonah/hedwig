/**
 * Script to fix wallet user IDs in the database
 * 
 * This script runs the SQL fix that converts phone numbers in the user_id column
 * of the wallets table to proper UUIDs that reference the users table.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase environment variables. Please check your .env file.');
  console.error('Required variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSqlFix() {
  try {
    console.log('Reading SQL fix script...');
    const sqlScript = fs.readFileSync(path.join(__dirname, 'fix-wallet-user-id.sql'), 'utf8');
    
    // Split the script into separate statements
    const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      try {
        const { data, error } = await supabase.rpc('run_sql', { sql: stmt + ';' });
        
        if (error) {
          console.error(`Error executing statement ${i + 1}:`, error);
          console.log('Statement:', stmt);
        } else {
          console.log(`Statement ${i + 1} executed successfully:`, data);
        }
      } catch (error) {
        console.error(`Error executing statement ${i + 1}:`, error);
        console.log('Statement:', stmt);
        // Continue with the next statement
      }
    }
    
    console.log('SQL fix completed successfully');
  } catch (error) {
    console.error('Error running SQL fix:', error);
    process.exit(1);
  }
}

// Run the SQL fix
runSqlFix()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 