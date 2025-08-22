const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

// Contract ABI and bytecode (we'll need to get this from Foundry compilation)
const contractArtifact = require('../out/HedwigPayment.sol/HedwigPayment.json');

async function main() {
  console.log('=== Deploying Enhanced HedwigPayment Contract ===');
  
  // Network configuration
  const network = process.env.NETWORK || 'base-sepolia';
  const rpcUrl = network === 'base-sepolia' 
    ? 'https://sepolia.base.org'
    : 'https://mainnet.base.org';
  
  console.log(`Network: ${network}`);
  console.log(`RPC URL: ${rpcUrl}`);
  
  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  if (!process.env.PLATFORM_PRIVATE_KEY) {
    throw new Error('PLATFORM_PRIVATE_KEY not found in environment variables');
  }
  
  const wallet = new ethers.Wallet(process.env.PLATFORM_PRIVATE_KEY, provider);
  const deployerAddress = await wallet.getAddress();
  
  console.log(`Deployer address: ${deployerAddress}`);
  
  // Get deployer balance
  const balance = await provider.getBalance(deployerAddress);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    throw new Error('Deployer has no ETH for gas fees');
  }
  
  // Platform wallet configuration
  const platformWallet = process.env.HEDWIG_PLATFORM_WALLET_TESTNET 
    || process.env.HEDWIG_PLATFORM_WALLET 
    || deployerAddress;
  
  // USDC address for the network
  const usdcAddress = network === 'base-sepolia'
    ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC
  
  console.log(`Platform wallet: ${platformWallet}`);
  console.log(`USDC address: ${usdcAddress}`);
  
  // Create contract factory
  const contractFactory = new ethers.ContractFactory(
    contractArtifact.abi,
    contractArtifact.bytecode,
    wallet
  );
  
  console.log('\nDeploying contract...');
  
  // Deploy the contract
  const hedwigPayment = await contractFactory.deploy(
    platformWallet,
    usdcAddress,
    {
      gasLimit: 3000000, // Set a reasonable gas limit
    }
  );
  
  console.log(`Transaction hash: ${hedwigPayment.deploymentTransaction().hash}`);
  console.log('Waiting for deployment confirmation...');
  
  // Wait for deployment
  await hedwigPayment.waitForDeployment();
  const contractAddress = await hedwigPayment.getAddress();
  
  console.log(`\n✅ Contract deployed successfully!`);
  console.log(`Contract address: ${contractAddress}`);
  
  // Verify contract details
  try {
    const version = await hedwigPayment.version();
    const owner = await hedwigPayment.owner();
    const platformFee = await hedwigPayment.platformFee();
    const contractPlatformWallet = await hedwigPayment.platformWallet();
    const contractUSDC = await hedwigPayment.USDC();
    const isUSDCWhitelisted = await hedwigPayment.isTokenWhitelisted(usdcAddress);
    
    console.log('\n=== Contract Verification ===');
    console.log(`Version: ${version}`);
    console.log(`Owner: ${owner}`);
    console.log(`Platform fee: ${platformFee} basis points (${Number(platformFee) / 100}%)`);
    console.log(`Platform wallet: ${contractPlatformWallet}`);
    console.log(`USDC address: ${contractUSDC}`);
    console.log(`USDC whitelisted: ${isUSDCWhitelisted}`);
    
  } catch (error) {
    console.warn('⚠️  Could not verify contract details:', error.message);
  }
  
  // Save deployment info
  const deploymentInfo = {
    contractAddress: contractAddress,
    platformWallet: platformWallet,
    usdcAddress: usdcAddress,
    deploymentTransaction: hedwigPayment.deploymentTransaction().hash,
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    network: network,
    chainId: network === 'base-sepolia' ? 84532 : 8453,
    gasUsed: hedwigPayment.deploymentTransaction().gasLimit?.toString() || 'unknown'
  };
  
  // Save to file
  const deploymentFile = path.join(__dirname, `../deployments/${network}-deployment.json`);
  const deploymentsDir = path.dirname(deploymentFile);
  
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${deploymentFile}`);
  
  // Environment variable configuration
  console.log('\n=== Environment Configuration ===');
  console.log('Add these to your .env.local file:');
  console.log('');
  
  if (network === 'base-sepolia') {
    console.log(`NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=${contractAddress}`);
    console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=${contractAddress}`);
    console.log(`HEDWIG_PLATFORM_WALLET_TESTNET=${platformWallet}`);
  } else {
    console.log(`NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=${contractAddress}`);
    console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET=${contractAddress}`);
    console.log(`HEDWIG_PLATFORM_WALLET_MAINNET=${platformWallet}`);
  }
  
  // Generate admin key if not exists
  if (!process.env.HEDWIG_ADMIN_KEY) {
    const adminKey = require('crypto').randomBytes(32).toString('hex');
    console.log(`HEDWIG_ADMIN_KEY=${adminKey}`);
    console.log('\n⚠️  IMPORTANT: Save the admin key securely! It\'s needed for contract management.');
  }
  
  console.log('\n=== Next Steps ===');
  console.log('1. Update your .env.local file with the contract address');
  console.log('2. Update the TypeScript contract service integration');
  console.log('3. Update frontend hooks to work with the new contract');
  console.log('4. Test the contract functionality');
  console.log('5. Optionally verify the contract on Basescan');
  
  return {
    contractAddress,
    deploymentInfo
  };
}

if (require.main === module) {
  main()
    .then((result) => {
      console.log('\n🎉 Deployment completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Deployment failed:');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };