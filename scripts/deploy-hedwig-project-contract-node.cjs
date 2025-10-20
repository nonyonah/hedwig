const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Deploying HedwigProjectContract to Base Mainnet...');

  // Check environment variables
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error('DEPLOYER_PRIVATE_KEY not found in .env.local');
  }
  
  if (!process.env.BASE_MAINNET_RPC_URL) {
    throw new Error('BASE_MAINNET_RPC_URL not found in .env.local');
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  console.log('Deploying with account:', wallet.address);
  console.log('Expected deployer address: 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d');

  // Verify deployer address matches expected
  if (wallet.address.toLowerCase() !== '0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d'.toLowerCase()) {
    console.warn('⚠️  Warning: Deployer address does not match expected address!');
    console.warn(`Expected: 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d`);
    console.warn(`Actual: ${wallet.address}`);
  }

  // Platform wallet and fee configuration
  const platformWallet = process.env.HEDWIG_PLATFORM_WALLET_MAINNET || '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc';
  const platformFeeRate = 250; // 2.5% (250 basis points)

  console.log('Platform wallet:', platformWallet);
  console.log('Expected platform wallet: 0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc');
  console.log('Platform fee rate:', platformFeeRate, 'basis points (2.5%)');

  // Verify platform wallet matches expected
  if (platformWallet.toLowerCase() !== '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc'.toLowerCase()) {
    console.warn('⚠️  Warning: Platform wallet does not match expected address!');
    console.warn(`Expected: 0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc`);
    console.warn(`Actual: ${platformWallet}`);
  }

  // Read the compiled contract
  const contractArtifactPath = path.join(__dirname, '..', 'out', 'HedwigProjectContract.sol', 'HedwigProjectContract.json');
  
  if (!fs.existsSync(contractArtifactPath)) {
    throw new Error('Contract artifact not found. Please run: forge build');
  }

  const contractArtifact = JSON.parse(fs.readFileSync(contractArtifactPath, 'utf8'));
  const { abi, bytecode } = contractArtifact;

  if (!bytecode || !bytecode.object) {
    throw new Error('Bytecode not found in contract artifact');
  }

  console.log('\nContract artifact loaded successfully');
  console.log('Bytecode length:', bytecode.object.length);

  // Create contract factory
  const contractFactory = new ethers.ContractFactory(abi, bytecode.object, wallet);

  console.log('\nDeploying contract...');
  console.log('Constructor arguments:');
  console.log('- Platform Wallet:', platformWallet);
  console.log('- Platform Fee Rate:', platformFeeRate, 'basis points');

  // Deploy the contract
  const contract = await contractFactory.deploy(platformWallet, platformFeeRate);
  
  console.log('\nDeployment transaction sent:', contract.deploymentTransaction().hash);
  console.log('Waiting for confirmation...');
  
  // Wait for deployment
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  
  console.log('\n✅ Contract deployed successfully!');
  console.log('Contract address:', contractAddress);
  
  // Verify deployment by calling view functions
  try {
    const deployedPlatformWallet = await contract.platformWallet();
    const deployedPlatformFeeRate = await contract.platformFeeRate();
    
    console.log('\n📋 Contract verification:');
    console.log('Platform wallet:', deployedPlatformWallet);
    console.log('Platform fee rate:', deployedPlatformFeeRate.toString(), 'basis points');
    
    if (deployedPlatformWallet.toLowerCase() === platformWallet.toLowerCase()) {
      console.log('✅ Platform wallet verified');
    } else {
      console.log('❌ Platform wallet mismatch');
    }
    
    if (deployedPlatformFeeRate.toString() === platformFeeRate.toString()) {
      console.log('✅ Platform fee rate verified');
    } else {
      console.log('❌ Platform fee rate mismatch');
    }
  } catch (error) {
    console.log('⚠️  Contract verification failed:', error.message);
  }

  // Deployment summary
  const deploymentInfo = {
    contractAddress: contractAddress,
    platformWallet: platformWallet,
    platformFeeRate: platformFeeRate,
    deploymentTransaction: contract.deploymentTransaction().hash,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    network: 'base-mainnet',
    chainId: 8453
  };

  console.log('\n📊 Deployment Summary:');
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Save deployment info to file
  const deploymentDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  
  const deploymentFilePath = path.join(deploymentDir, 'hedwig-project-contract-base-mainnet.json');
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentInfo, null, 2));
  console.log('\n💾 Deployment info saved to:', deploymentFilePath);

  console.log('\n🔧 Environment variables to update:');
  console.log(`HEDWIG_PROJECT_CONTRACT_ADDRESS_MAINNET=${contractAddress}`);
  console.log(`NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS_MAINNET=${contractAddress}`);
  console.log(`HEDWIG_PROJECT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS=${contractAddress}`);
  
  console.log('\n🎉 Deployment completed successfully!');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  });