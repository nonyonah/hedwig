#!/usr/bin/env node
/**
 * Network Switching Utility
 * Helps developers switch between testnet and mainnet configurations
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env.local');

function updateNetworkConfig(targetNetwork) {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('❌ .env.local file not found');
    process.exit(1);
  }

  let envContent = fs.readFileSync(ENV_FILE, 'utf8');
  
  if (targetNetwork === 'mainnet') {
    console.log('🔄 Switching to MAINNET configuration...');
    
    // Update network configuration
    envContent = envContent.replace(
      /NETWORK_ID=".*"/g,
      'NETWORK_ID="base-mainnet"'
    );
    envContent = envContent.replace(
      /NEXT_PUBLIC_NETWORK_ID=".*"/g,
      'NEXT_PUBLIC_NETWORK_ID="8453"'
    );
    
    // Update contract addresses to mainnet
    envContent = envContent.replace(
      /HEDWIG_PAYMENT_CONTRACT_ADDRESS=".*"/g,
      'HEDWIG_PAYMENT_CONTRACT_ADDRESS="0xB5d572B160145a6fc353d3b8c7ff3917fC3599d2"'
    );
    envContent = envContent.replace(
      /NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=".*"/g,
      'NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS="0xB5d572B160145a6fc353d3b8c7ff3917fC3599d2"'
    );
    
    // Update RPC URLs
    envContent = envContent.replace(
      /BASE_RPC_URL=".*"/g,
      'BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up"'
    );
    envContent = envContent.replace(
      /SOLANA_RPC_URL=".*"/g,
      'SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"'
    );
    
  } else if (targetNetwork === 'testnet') {
    console.log('🔄 Switching to TESTNET configuration...');
    
    // Update network configuration
    envContent = envContent.replace(
      /NETWORK_ID=".*"/g,
      'NETWORK_ID="base-sepolia"'
    );
    envContent = envContent.replace(
      /NEXT_PUBLIC_NETWORK_ID=".*"/g,
      'NEXT_PUBLIC_NETWORK_ID="84532"'
    );
    
    // Update contract addresses to testnet
    envContent = envContent.replace(
      /HEDWIG_PAYMENT_CONTRACT_ADDRESS=".*"/g,
      'HEDWIG_PAYMENT_CONTRACT_ADDRESS="0x1c0A0eFBb438cc7705b947644F6AB88698b2704F"'
    );
    envContent = envContent.replace(
      /NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=".*"/g,
      'NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS="0xfd63f4696a505B2aa6b77F578F8031905940072D"'
    );
    
    // Update RPC URLs
    envContent = envContent.replace(
      /BASE_RPC_URL=".*"/g,
      'BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up"'
    );
    envContent = envContent.replace(
      /SOLANA_RPC_URL=".*"/g,
      'SOLANA_RPC_URL="https://api.devnet.solana.com"'
    );
  } else {
    console.error('❌ Invalid network. Use "mainnet" or "testnet"');
    process.exit(1);
  }
  
  // Write updated configuration
  fs.writeFileSync(ENV_FILE, envContent);
  
  console.log(`✅ Successfully switched to ${targetNetwork.toUpperCase()}`);
  console.log('📋 Updated configurations:');
  console.log(`   - Network ID: ${targetNetwork === 'mainnet' ? 'base-mainnet (8453)' : 'base-sepolia (84532)'}`);
  console.log(`   - Contract Address: ${targetNetwork === 'mainnet' ? '0xB5d572B160145a6fc353d3b8c7ff3917fC3599d2' : '0x1c0A0eFBb438cc7705b947644F6AB88698b2704F'}`);
  console.log(`   - Base RPC: ${targetNetwork === 'mainnet' ? 'mainnet' : 'sepolia'}`);
  console.log(`   - Solana RPC: ${targetNetwork === 'mainnet' ? 'mainnet-beta' : 'devnet'}`);
  console.log('');
  console.log('⚠️  Please restart your development server for changes to take effect.');
}

function showCurrentConfig() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('❌ .env.local file not found');
    return;
  }
  
  const envContent = fs.readFileSync(ENV_FILE, 'utf8');
  
  const networkIdMatch = envContent.match(/NETWORK_ID="([^"]*)"/);  
  const contractMatch = envContent.match(/HEDWIG_PAYMENT_CONTRACT_ADDRESS="([^"]*)"/);  
  const baseRpcMatch = envContent.match(/BASE_RPC_URL="([^"]*)"/);  
  
  const networkId = networkIdMatch ? networkIdMatch[1] : 'unknown';
  const contractAddress = contractMatch ? contractMatch[1] : 'unknown';
  const baseRpc = baseRpcMatch ? baseRpcMatch[1] : 'unknown';
  
  const isMainnet = networkId.includes('mainnet') || networkId === '8453';
  
  console.log('📊 Current Network Configuration:');
  console.log(`   Network: ${isMainnet ? '🟢 MAINNET' : '🟡 TESTNET'}`);
  console.log(`   Network ID: ${networkId}`);
  console.log(`   Contract: ${contractAddress}`);
  console.log(`   Base RPC: ${baseRpc.includes('mainnet') ? 'mainnet' : 'testnet'}`);
}

function showHelp() {
  console.log('🔧 Hedwig Network Switching Utility');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/switch-network.js [command]');
  console.log('');
  console.log('Commands:');
  console.log('  mainnet    Switch to mainnet configuration');
  console.log('  testnet    Switch to testnet configuration');
  console.log('  status     Show current network configuration');
  console.log('  help       Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/switch-network.js mainnet');
  console.log('  node scripts/switch-network.js testnet');
  console.log('  node scripts/switch-network.js status');
}

// Main execution
const command = process.argv[2];

switch (command) {
  case 'mainnet':
    updateNetworkConfig('mainnet');
    break;
  case 'testnet':
    updateNetworkConfig('testnet');
    break;
  case 'status':
    showCurrentConfig();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (!command) {
      showCurrentConfig();
    } else {
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
    }
}