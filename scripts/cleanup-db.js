// Script to clean up and recover the database
// This is useful for removing orphaned wallets or fixing inconsistencies

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

// CDP API configuration
const CDP_API_URL = "https://api.cdp.coinbase.com/v2";
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

// Format chain name for CDP API
function formatNetworkName(chain) {
  switch (chain.toLowerCase()) {
    case "base":
      return "base-sepolia";
    case "ethereum":
    case "evm":
      return "ethereum-sepolia";
    case "solana":
      return "solana-devnet";
    default:
      return chain;
  }
}

// Check if a wallet exists in CDP
async function checkWalletExists(address, network) {
  try {
    const response = await fetch(
      `${CDP_API_URL}/accounts/${address}/balances?network=${network}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "CDP-API-KEY": CDP_API_KEY_ID,
          "CDP-API-SECRET": CDP_API_KEY_SECRET,
        },
      }
    );
    
    return response.ok;
  } catch (error) {
    console.error(`Error checking wallet ${address}:`, error);
    return false;
  }
}

// Find orphaned wallets (wallets without a user)
async function findOrphanedWallets() {
  try {
    console.log('Finding orphaned wallets...');
    
    // Get all wallets
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*');
      
    if (error) {
      console.error('Error fetching wallets:', error);
      return [];
    }
    
    const orphanedWallets = [];
    
    // Check each wallet for a valid user
    for (const wallet of wallets) {
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', wallet.user_id);
        
      // If no users found or error occurred, consider it an orphaned wallet
      if (userError || !users || users.length === 0) {
        console.log(`Found orphaned wallet: ${wallet.address} (user_id: ${wallet.user_id})`);
        orphanedWallets.push(wallet);
      }
    }
    
    console.log(`Found ${orphanedWallets.length} orphaned wallets`);
    return orphanedWallets;
  } catch (error) {
    console.error('Error finding orphaned wallets:', error);
    return [];
  }
}

// Remove orphaned wallets
async function removeOrphanedWallets() {
  try {
    console.log('Removing orphaned wallets...');
    
    const orphanedWallets = await findOrphanedWallets();
    
    if (orphanedWallets.length === 0) {
      console.log('No orphaned wallets found');
      return;
    }
    
    // Get orphaned wallet IDs
    const orphanedWalletIds = orphanedWallets.map(wallet => wallet.id);
    
    // Delete orphaned wallets
    const { error } = await supabase
      .from('wallets')
      .delete()
      .in('id', orphanedWalletIds);
      
    if (error) {
      console.error('Error deleting orphaned wallets:', error);
      return;
    }
    
    console.log(`Successfully removed ${orphanedWallets.length} orphaned wallets`);
  } catch (error) {
    console.error('Error removing orphaned wallets:', error);
  }
}

// Find invalid wallets (wallets that don't exist in CDP)
async function findInvalidWallets() {
  try {
    console.log('Finding invalid wallets...');
    
    // Get all wallets
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*');
      
    if (error) {
      console.error('Error fetching wallets:', error);
      return [];
    }
    
    const invalidWallets = [];
    
    // Check each wallet in CDP
    for (const wallet of wallets) {
      const network = formatNetworkName(wallet.chain);
      const exists = await checkWalletExists(wallet.address, network);
      
      if (!exists) {
        console.log(`Found invalid wallet: ${wallet.address} (user_id: ${wallet.user_id})`);
        invalidWallets.push(wallet);
      }
    }
    
    console.log(`Found ${invalidWallets.length} invalid wallets`);
    return invalidWallets;
  } catch (error) {
    console.error('Error finding invalid wallets:', error);
    return [];
  }
}

// Remove invalid wallets
async function removeInvalidWallets() {
  try {
    console.log('Removing invalid wallets...');
    
    const invalidWallets = await findInvalidWallets();
    
    if (invalidWallets.length === 0) {
      console.log('No invalid wallets found');
      return;
    }
    
    // Get invalid wallet IDs
    const invalidWalletIds = invalidWallets.map(wallet => wallet.id);
    
    // Delete invalid wallets
    const { error } = await supabase
      .from('wallets')
      .delete()
      .in('id', invalidWalletIds);
      
    if (error) {
      console.error('Error deleting invalid wallets:', error);
      return;
    }
    
    console.log(`Successfully removed ${invalidWallets.length} invalid wallets`);
  } catch (error) {
    console.error('Error removing invalid wallets:', error);
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Available commands:');
    console.log('  find-orphaned - Find orphaned wallets');
    console.log('  remove-orphaned - Remove orphaned wallets');
    console.log('  find-invalid - Find invalid wallets');
    console.log('  remove-invalid - Remove invalid wallets');
    console.log('  cleanup-all - Run all cleanup operations');
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'find-orphaned':
      await findOrphanedWallets();
      break;
    case 'remove-orphaned':
      await removeOrphanedWallets();
      break;
    case 'find-invalid':
      await findInvalidWallets();
      break;
    case 'remove-invalid':
      await removeInvalidWallets();
      break;
    case 'cleanup-all':
      await removeOrphanedWallets();
      await removeInvalidWallets();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      break;
  }
}

// Run the script
main();