// Test script to verify CDP integration

// Load environment variables
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '../.env.local') });

import { createWallet, getBalances } from '../src/lib/cdp.js';

// Test function to verify CDP integration
async function testCDPIntegration() {
  try {
    console.log('Testing CDP integration...');
    
    // Check if API keys are set
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    
    if (!apiKeyId || !apiKeySecret) {
      console.error('CDP API keys are not set. Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET in your .env file.');
      return;
    }
    
    console.log('CDP API keys found. Testing wallet creation...');
    
    // Test creating a wallet on Base Sepolia
    const network = 'base-sepolia';
    // Use a test user ID
    const testUserId = 'test-user-' + Date.now();
    const wallet = await createWallet(testUserId, network);
    
    console.log('Wallet created successfully:');
    console.log('- Address:', wallet.address);
    console.log('- Network:', network);
    console.log('- CDP Wallet ID:', wallet.cdp_wallet_id);
    
    // Test getting balances
    console.log('\nFetching balances for the new wallet...');
    const balances = await getBalances(wallet.address, network);
    
    console.log(`Found ${balances.length} balances:`);
    balances.forEach(balance => {
      console.log(`- ${balance.asset.symbol}: ${balance.balance} (${balance.asset.decimals} decimals)`);
    });
    
    console.log('\nCDP integration test completed successfully!');
  } catch (error) {
    console.error('Error testing CDP integration:', error);
  }
}

// Run the test
testCDPIntegration();