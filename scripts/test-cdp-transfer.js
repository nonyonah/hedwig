// Test script to verify CDP transfer functionality

// Load environment variables
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '../.env.local') });

import { createWallet, getBalances, transferNativeToken } from '../src/lib/cdp.js';

// Test function to verify CDP transfer functionality
async function testCDPTransfer() {
  try {
    console.log('Testing CDP transfer functionality...');
    
    // Check if API keys are set
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    
    if (!apiKeyId || !apiKeySecret) {
      console.error('CDP API keys are not set. Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET in your .env file.');
      return;
    }
    
    console.log('CDP API keys found. Creating source wallet...');
    
    // Test creating a source wallet on Base Sepolia
    const network = 'base-sepolia';
    const sourceUserId = 'test-source-' + Date.now();
    const sourceWallet = await createWallet(sourceUserId, network);
    
    console.log('Source wallet created successfully:');
    console.log('- Address:', sourceWallet.address);
    console.log('- Network:', network);
    
    console.log('\nCreating destination wallet...');
    
    // Test creating a destination wallet on Base Sepolia
    const destUserId = 'test-dest-' + Date.now();
    const destWallet = await createWallet(destUserId, network);
    
    console.log('Destination wallet created successfully:');
    console.log('- Address:', destWallet.address);
    
    // Check source wallet balance
    console.log('\nChecking source wallet balance...');
    const sourceBalances = await getBalances(sourceWallet.address, network);
    
    console.log(`Source wallet has ${sourceBalances.length} balances:`);
    sourceBalances.forEach(balance => {
      console.log(`- ${balance.asset.symbol}: ${balance.balance} (${balance.asset.decimals} decimals)`);
    });
    
    // If source wallet has no funds, prompt user to fund it
    if (sourceBalances.length === 0 || sourceBalances[0].balance === '0') {
      console.log('\n⚠️ Source wallet has no funds. Please fund the wallet before testing transfers.');
      console.log(`Fund this address: ${sourceWallet.address}`);
      console.log('You can use a faucet like https://faucet.base.org/ for Base Sepolia testnet.');
      console.log('\nAfter funding, run this script again with the wallet address as an argument:');
      console.log(`node scripts/test-cdp-transfer.js ${sourceWallet.address} ${destWallet.address}`);
      return;
    }
    
    // Attempt transfer
    console.log('\nAttempting to transfer 0.001 ETH from source to destination...');
    const transferResult = await transferNativeToken(
      sourceWallet.address,
      destWallet.address,
      '0.001',
      network
    );
    
    console.log('Transfer successful!');
    console.log('- Transaction hash:', transferResult.hash);
    
    // Check destination wallet balance after transfer
    console.log('\nChecking destination wallet balance after transfer...');
    const destBalancesAfter = await getBalances(destWallet.address, network);
    
    console.log(`Destination wallet now has ${destBalancesAfter.length} balances:`);
    destBalancesAfter.forEach(balance => {
      console.log(`- ${balance.asset.symbol}: ${balance.balance} (${balance.asset.decimals} decimals)`);
    });
    
    console.log('\nCDP transfer test completed successfully!');
  } catch (error) {
    console.error('Error testing CDP transfer:', error);
  }
}

// Check if wallet addresses were provided as arguments
const args = process.argv.slice(2);
if (args.length === 2) {
  // Use provided wallet addresses
  const sourceAddress = args[0];
  const destAddress = args[1];
  
  console.log(`Using provided wallet addresses:\n- Source: ${sourceAddress}\n- Destination: ${destAddress}`);
  
  // Test transfer with provided addresses
  (async () => {
    try {
      const network = 'base-sepolia';
      console.log('\nAttempting to transfer 0.001 ETH between provided addresses...');
      const transferResult = await transferNativeToken(
        sourceAddress,
        destAddress,
        '0.001',
        network
      );
      
      console.log('Transfer successful!');
      console.log('- Transaction hash:', transferResult.hash);
      
      // Check destination wallet balance after transfer
      console.log('\nChecking destination wallet balance after transfer...');
      const destBalancesAfter = await getBalances(destAddress, network);
      
      console.log(`Destination wallet now has ${destBalancesAfter.length} balances:`);
      destBalancesAfter.forEach(balance => {
        console.log(`- ${balance.asset.symbol}: ${balance.balance} (${balance.asset.decimals} decimals)`);
      });
    } catch (error) {
      console.error('Error performing transfer with provided addresses:', error);
    }
  })();
} else {
  // Run the full test
  testCDPTransfer();
}