const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Creating invoices table...');
console.log('Supabase URL:', supabaseUrl ? 'Set' : 'Not set');
console.log('Service Key:', supabaseServiceKey ? 'Set' : 'Not set');

if (!supabaseUrl || !supabaseServiceKey) {
  console.log('Environment variables not set. Please run this command with your Supabase credentials:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=your_url SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/create-invoices-table.cjs');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createInvoicesTable() {
  try {
    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250127000002_create_invoices_table.sql');
    const sqlScript = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Executing migration...');
    
    // Split the SQL into individual statements
    const statements = sqlScript
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        
        const { error } = await supabase.rpc('exec_sql', {
          sql: statement + ';'
        });
        
        if (error) {
          console.error('Error executing statement:', error);
          console.error('Statement was:', statement);
        } else {
          console.log('✓ Statement executed successfully');
        }
      }
    }
    
    console.log('Migration completed successfully!');
    
    // Test if the table was created
    console.log('Testing table creation...');
    const { data, error } = await supabase
      .from('invoices')
      .select('count(*)')
      .limit(1);
      
    if (error) {
      console.error('Error testing table:', error);
    } else {
      console.log('✓ Invoices table is accessible');
    }
    
  } catch (error) {
    console.error('Error in createInvoicesTable:', error);
  }
}

createInvoicesTable();