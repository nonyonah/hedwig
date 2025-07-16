// Script to update the users table schema
// This script renames privy_wallet_id to cdp_wallet_id in the users table.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '../.env.local') });

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Function to check if a column exists in a table
async function columnExists(table, column) {
  const { data, error } = await supabase.rpc('check_column_exists', {
    p_table: table,
    p_column: column
  });
  if (error) {
    console.error(`Error checking for column ${column} in ${table}:`, error);
    // As a fallback, we can try a select query. If it doesn't fail, the column exists.
    const { error: selectError } = await supabase.from(table).select(column).limit(1);
    return !selectError;
  }
  return data;
}

// Main function to update the schema
async function updateUserSchema() {
  try {
    console.log('Starting users table schema update...');
    const hasPrivyColumn = await columnExists('users', 'privy_wallet_id');

    if (hasPrivyColumn) {
      console.log('Renaming privy_wallet_id to cdp_wallet_id in users table...');
      const { error: renameError } = await supabase.rpc('rename_column', {
        p_table: 'users',
        p_old_column: 'privy_wallet_id',
        p_new_column: 'cdp_wallet_id'
      });

      if (renameError) {
        console.error('Error renaming column with RPC. Trying raw SQL...');
        const { error: sqlError } = await supabase.rpc('run_sql', {
          query: 'ALTER TABLE public.users RENAME COLUMN privy_wallet_id TO cdp_wallet_id;'
        });
        if (sqlError) throw sqlError;
      }
      console.log('Column privy_wallet_id renamed to cdp_wallet_id successfully.');
    } else {
      console.log('privy_wallet_id column does not exist in users table.');
      const hasCdpColumn = await columnExists('users', 'cdp_wallet_id');
      if (!hasCdpColumn) {
        console.log('cdp_wallet_id column does not exist. Adding it...');
        const { error: addError } = await supabase.rpc('run_sql', {
          query: 'ALTER TABLE public.users ADD COLUMN cdp_wallet_id TEXT;'
        });
        if (addError) throw addError;
        console.log('cdp_wallet_id column added to users table.');
      } else {
        console.log('cdp_wallet_id column already exists. No action needed.');
      }
    }
  } catch (error) {
    console.error('Failed to update user schema:', error);
    process.exit(1);
  }
}

// Execute the script
updateUserSchema().then(() => {
  console.log('User schema update process finished.');
  process.exit(0);
});
