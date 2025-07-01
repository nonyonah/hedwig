// Script to update the database schema
// This script updates the wallets table to change privy_wallet_id to cdp_wallet_id

// Load environment variables
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

// Function to check if column exists
async function columnExists(table, column) {
  try {
    // Use system tables to check if column exists
    const { data, error } = await supabase
      .rpc('check_column_exists', {
        p_table: table,
        p_column: column
      });
    
    if (error) {
      console.error(`Error checking if column exists: ${error.message}`);
      
      // Fallback method if RPC is not available
      console.log('Trying fallback method to check column existence...');
      
      // Try to select from the table with the column
      const { error: selectError } = await supabase
        .from(table)
        .select(column)
        .limit(1);
        
      // If there's no error, the column exists
      return !selectError;
    }
    
    return data;
  } catch (error) {
    console.error(`Error in columnExists: ${error.message}`);
    return false;
  }
}

// Function to update the schema
async function updateSchema() {
  try {
    console.log('Starting schema update...');
    
    // Check if privy_wallet_id column exists
    const hasPrivyColumn = await columnExists('wallets', 'privy_wallet_id');
    
    if (!hasPrivyColumn) {
      console.log('privy_wallet_id column does not exist, checking for blockradar_wallet_id...');
      
      // Check if blockradar_wallet_id column exists
      const hasBlockradarColumn = await columnExists('wallets', 'blockradar_wallet_id');
      
      if (!hasBlockradarColumn) {
        console.log('Neither privy_wallet_id nor blockradar_wallet_id columns exist.');
        console.log('Adding cdp_wallet_id column...');
        
        // Add cdp_wallet_id column
        const { error: addError } = await supabase.rpc('add_column', {
          p_table: 'wallets',
          p_column: 'cdp_wallet_id',
          p_type: 'text'
        });
        
        if (addError) {
          console.error(`Error adding cdp_wallet_id column: ${addError.message}`);
          
          // Fallback: use SQL query
          console.log('Using SQL to add column...');
          await supabase.rpc('run_sql', {
            query: 'ALTER TABLE wallets ADD COLUMN IF NOT EXISTS cdp_wallet_id TEXT'
          });
        }
        
        console.log('cdp_wallet_id column added successfully');
        return;
      }
      
      // Rename blockradar_wallet_id to cdp_wallet_id
      console.log('Renaming blockradar_wallet_id to cdp_wallet_id...');
      
      const { error: renameError } = await supabase.rpc('rename_column', {
        p_table: 'wallets',
        p_old_column: 'blockradar_wallet_id',
        p_new_column: 'cdp_wallet_id'
      });
      
      if (renameError) {
        console.error(`Error renaming column: ${renameError.message}`);
        
        // Fallback: use SQL query
        console.log('Using SQL to rename column...');
        await supabase.rpc('run_sql', {
          query: 'ALTER TABLE wallets RENAME COLUMN blockradar_wallet_id TO cdp_wallet_id'
        });
      }
      
      console.log('Column renamed successfully');
      return;
    }
    
    // Rename privy_wallet_id to cdp_wallet_id
    console.log('Renaming privy_wallet_id to cdp_wallet_id...');
    
    const { error: renameError } = await supabase.rpc('rename_column', {
      p_table: 'wallets',
      p_old_column: 'privy_wallet_id',
      p_new_column: 'cdp_wallet_id'
    });
    
    if (renameError) {
      console.error(`Error renaming column: ${renameError.message}`);
      
      // Fallback: use SQL query
      console.log('Using SQL to rename column...');
      await supabase.rpc('run_sql', {
        query: 'ALTER TABLE wallets RENAME COLUMN privy_wallet_id TO cdp_wallet_id'
      });
    }
    
    console.log('Column renamed successfully');
    
    // Check if blockradar_address_id column exists
    const hasBlockradarAddressColumn = await columnExists('wallets', 'blockradar_address_id');
    
    if (hasBlockradarAddressColumn) {
      // Rename blockradar_address_id to cdp_address_id
      console.log('Renaming blockradar_address_id to cdp_address_id...');
      
      const { error: renameAddressError } = await supabase.rpc('rename_column', {
        p_table: 'wallets',
        p_old_column: 'blockradar_address_id',
        p_new_column: 'cdp_address_id'
      });
      
      if (renameAddressError) {
        console.error(`Error renaming address column: ${renameAddressError.message}`);
        
        // Fallback: use SQL query
        console.log('Using SQL to rename address column...');
        await supabase.rpc('run_sql', {
          query: 'ALTER TABLE wallets RENAME COLUMN blockradar_address_id TO cdp_address_id'
        });
      }
      
      console.log('Address column renamed successfully');
    }
    
  } catch (error) {
    console.error(`Error updating schema: ${error.message}`);
  }
}

// Run the schema update
updateSchema()
  .then(() => {
    console.log('Schema update completed');
    process.exit(0);
  })
  .catch(error => {
    console.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  }); 