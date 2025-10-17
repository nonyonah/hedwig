const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });

// Contract ABI for the setTokenWhitelist function
const HEDWIG_PAYMENT_ABI = [
  {
    "inputs": [
      { "name": "_token", "type": "address", "internalType": "address" },
      { "name": "_status", "type": "bool", "internalType": "bool" }
    ],
    "name": "setTokenWhitelist",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "_token", "type": "address", "internalType": "address" }],
    "name": "isTokenWhitelisted",
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// Network configurations
const NETWORK_CONFIGS = {
  'base-mainnet': {
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    chainId: 8453,
    contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE,
    tokens: {
      'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'USDT': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      'USDbC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'
    }
  },
  'celo-mainnet': {
    rpcUrl: process.env.CELO_RPC_URL || 'https://forno.celo.org',
    chainId: 42220,
    contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO,
    tokens: {
      'cUSD': '0x765DE816845861e75A25fCA122bb6898B8B1282a',
      'USDC': '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      'USDT': '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e'
    }
  }
};

async function whitelistTokensForNetwork(networkName) {
  const config = NETWORK_CONFIGS[networkName];
  
  if (!config.contractAddress) {
    console.error(`❌ Contract address not configured for ${networkName}`);
    console.error(`   Please set the appropriate environment variable:`);
    if (networkName === 'base-mainnet') {
      console.error(`   HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE`);
    } else if (networkName === 'celo-mainnet') {
      console.error(`   HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO`);
    }
    return false;
  }

  console.log(`\n🔗 Connecting to ${networkName}...`);
  console.log(`   RPC: ${config.rpcUrl}`);
  console.log(`   Contract: ${config.contractAddress}`);

  // Create provider and wallet
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  
  // Get private key from environment
  const privateKey = process.env.PLATFORM_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PLATFORM_PRIVATE_KEY not found in environment variables');
    return false;
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`   Wallet: ${wallet.address}`);

  // Create contract instance
  const contract = new ethers.Contract(config.contractAddress, HEDWIG_PAYMENT_ABI, wallet);

  try {
    // Check if wallet is the owner
    const owner = await contract.owner();
    console.log(`   Contract Owner: ${owner}`);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error(`❌ Wallet ${wallet.address} is not the contract owner (${owner})`);
      return false;
    }

    // Check current whitelist status and whitelist tokens
    console.log(`\n📋 Checking and whitelisting tokens for ${networkName}:`);
    
    let allSuccess = true;
    for (const [symbol, address] of Object.entries(config.tokens)) {
      try {
        // Check current status
        const isWhitelisted = await contract.isTokenWhitelisted(address);
        console.log(`   ${symbol} (${address}): ${isWhitelisted ? '✅ Already whitelisted' : '❌ Not whitelisted'}`);
        
        if (!isWhitelisted) {
          console.log(`   🔄 Whitelisting ${symbol}...`);
          const tx = await contract.setTokenWhitelist(address, true);
          console.log(`   📝 Transaction hash: ${tx.hash}`);
          
          const receipt = await tx.wait();
          if (receipt.status === 1) {
            console.log(`   ✅ ${symbol} successfully whitelisted!`);
          } else {
            console.log(`   ❌ Failed to whitelist ${symbol}`);
            allSuccess = false;
          }
        }
      } catch (error) {
        console.error(`   ❌ Error processing ${symbol}:`, error.message);
        allSuccess = false;
      }
    }

    return allSuccess;
  } catch (error) {
    console.error(`❌ Error connecting to contract on ${networkName}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting token whitelisting process...');
  
  const networks = ['base-mainnet', 'celo-mainnet'];
  let overallSuccess = true;

  for (const network of networks) {
    const success = await whitelistTokensForNetwork(network);
    if (!success) {
      overallSuccess = false;
    }
  }

  console.log('\n' + '='.repeat(50));
  if (overallSuccess) {
    console.log('🎉 All tokens successfully whitelisted on all networks!');
  } else {
    console.log('⚠️  Some tokens failed to be whitelisted. Please check the errors above.');
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.length > 0) {
  const network = args[0];
  if (NETWORK_CONFIGS[network]) {
    whitelistTokensForNetwork(network).then(success => {
      if (!success) process.exit(1);
    });
  } else {
    console.error(`❌ Unknown network: ${network}`);
    console.error(`Available networks: ${Object.keys(NETWORK_CONFIGS).join(', ')}`);
    process.exit(1);
  }
} else {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}