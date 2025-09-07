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

async function createTable() {
  try {
    console.log('Creating offramp_transactions table...');
    
    // Read the table creation file
    const createTableSQL = readFileSync(join(__dirname, 'create_offramp_transactions_table.sql'), 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = createTableSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        
        // Use the raw query method
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.error('Error executing statement:', error);
          console.error('Statement was:', statement);
          // Continue with other statements even if one fails
        } else {
          console.log('✓ Statement executed successfully');
        }
      }
    }
    
    console.log('Table creation completed!');
  } catch (error) {
    console.error('Table creation failed:', error);
  }
}

createTable();