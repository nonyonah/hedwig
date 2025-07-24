const { createClient } = require('@supabase/supabase-js');

// Try to get environment variables from process.env or use defaults for local development
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

console.log('Attempting to connect to Supabase...');
console.log('URL:', supabaseUrl);
console.log('Service Key:', supabaseServiceKey ? 'Set' : 'Not set');

if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey === 'your-service-role-key') {
  console.log('Environment variables not properly set. Skipping migration.');
  console.log('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addInvoiceFields() {
  try {
    console.log('Adding missing fields to invoices table...');
    
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE invoices 
        ADD COLUMN IF NOT EXISTS invoice_number text,
        ADD COLUMN IF NOT EXISTS due_date text,
        ADD COLUMN IF NOT EXISTS payment_instructions text,
        ADD COLUMN IF NOT EXISTS additional_notes text;
      `
    });

    if (error) {
      console.error('Error adding fields:', error);
      // Try alternative approach with individual ALTER statements
      console.log('Trying alternative approach...');
      
      const alterStatements = [
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date text', 
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_instructions text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS additional_notes text'
      ];
      
      for (const sql of alterStatements) {
        const { error: altError } = await supabase.rpc('exec_sql', { sql });
        if (altError) {
          console.error(`Error executing: ${sql}`, altError);
        } else {
          console.log(`Successfully executed: ${sql}`);
        }
      }
    } else {
      console.log('Successfully added all fields to invoices table');
    }
    
  } catch (error) {
    console.error('Error in addInvoiceFields:', error);
  }
}

addInvoiceFields();