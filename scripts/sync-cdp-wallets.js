// Script to sync wallets between CDP and Supabase
// This is useful after a database reset to ensure all wallets are properly tracked

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

// Get all wallets from CDP
async function getCDPWallets() {
  try {
    console.log('Fetching wallets from CDP...');
    
    // This is a placeholder - CDP doesn't have a direct "list all wallets" endpoint
    // In a real implementation, you might need to iterate through known addresses
    // or use a different approach depending on CDP's capabilities
    
    console.log('Warning: CDP does not provide a direct way to list all wallets.');
    console.log('This function will need to be implemented based on your specific needs.');
    
    return [];
  } catch (error) {
    console.error('Error fetching wallets from CDP:', error);
    return [];
  }
}

// Get all wallets from Supabase
async function getSupabaseWallets() {
  try {
    console.log('Fetching wallets from Supabase...');
    
    const { data, error } = await supabase
      .from('wallets')
      .select('*');
      
    if (error) {
      console.error('Error fetching wallets from Supabase:', error);
      return [];
    }
    
    console.log(`Found ${data.length} wallets in Supabase`);
    return data;
  } catch (error) {
    console.error('Error fetching wallets from Supabase:', error);
    return [];
  }
}

// Sync a specific wallet between CDP and Supabase
async function syncWallet(userId, address, chain) {
  try {
    console.log(`Syncing wallet ${address} for user ${userId} on chain ${chain}...`);
    
    // Check if wallet exists in CDP
    const network = formatNetworkName(chain);
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
    
    // If wallet doesn't exist in CDP, log and skip
    if (response.status === 404) {
      console.log(`Wallet ${address} does not exist in CDP, skipping`);
      return false;
    }
    
    // If wallet exists in CDP, add to Supabase if not already there
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('address', address)
      .single();
      
    if (existingWallet) {
      console.log(`Wallet ${address} already exists in Supabase, skipping`);
      return true;
    }
    
    // Insert wallet into Supabase
    const { error } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        address: address,
        chain: chain,
        cdp_wallet_id: address, // Use address as CDP wallet ID
        created_at: new Date().toISOString(),
      });
      
    if (error) {
      console.error(`Error inserting wallet ${address} into Supabase:`, error);
      return false;
    }
    
    console.log(`Successfully synced wallet ${address} to Supabase`);
    return true;
  } catch (error) {
    console.error(`Error syncing wallet ${address}:`, error);
    return false;
  }
}

// Sync all wallets for a specific user
async function syncUserWallets(userId) {
  try {
    console.log(`Syncing wallets for user ${userId}...`);
    
    // Get user from Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) {
      console.error(`Error fetching user ${userId}:`, error);
      return;
    }
    
    // Get wallets for this user from Supabase
    const { data: wallets } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId);
      
    console.log(`Found ${wallets?.length || 0} wallets for user ${userId} in Supabase`);
    
    // For each wallet, check if it exists in CDP
    for (const wallet of wallets || []) {
      await syncWallet(userId, wallet.address, wallet.chain);
    }
    
    console.log(`Finished syncing wallets for user ${userId}`);
  } catch (error) {
    console.error(`Error syncing wallets for user ${userId}:`, error);
  }
}

// Main function to sync all wallets
async function syncAllWallets() {
  try {
    console.log('Starting wallet sync between CDP and Supabase...');
    
    // Get all users from Supabase
    const { data: users, error } = await supabase
      .from('users')
      .select('id');
      
    if (error) {
      console.error('Error fetching users from Supabase:', error);
      return;
    }
    
    console.log(`Found ${users.length} users in Supabase`);
    
    // For each user, sync their wallets
    for (const user of users) {
      await syncUserWallets(user.id);
    }
    
    console.log('Wallet sync completed successfully');
  } catch (error) {
    console.error('Error syncing wallets:', error);
  }
}

// Run the sync
syncAllWallets(); 