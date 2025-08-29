const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Deploying HedwigPayment contract to Base Mainnet...');

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

  // Platform wallet and USDC addresses
  const platformWallet = process.env.HEDWIG_PLATFORM_WALLET_MAINNET || '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc';
  const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC

  console.log('Platform wallet:', platformWallet);
  console.log('Expected platform wallet: 0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc');
  console.log('USDC address:', usdcAddress);

  // Verify platform wallet matches expected
  if (platformWallet.toLowerCase() !== '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc'.toLowerCase()) {
    console.warn('⚠️  Warning: Platform wallet does not match expected address!');
    console.warn(`Expected: 0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc`);
    console.warn(`Actual: ${platformWallet}`);
  }

  // Read the compiled contract
  const contractArtifactPath = path.join(__dirname, '..', 'out', 'HedwigPayment.sol', 'HedwigPayment.json');
  
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
  console.log('- USDC Address:', usdcAddress);

  // Deploy the contract
  const contract = await contractFactory.deploy(platformWallet, usdcAddress);
  
  console.log('\nDeployment transaction sent:', contract.deploymentTransaction().hash);
  console.log('Waiting for confirmation...');
  
  // Wait for deployment
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  
  console.log('\n✅ Contract deployed successfully!');
  console.log('Contract address:', contractAddress);
  
  // Verify deployment by calling a view function
  try {
    const deployedPlatformWallet = await contract.platformWallet();
    const deployedUSDC = await contract.USDC();
    const version = await contract.VERSION();
    
    console.log('\n📋 Contract verification:');
    console.log('Platform wallet:', deployedPlatformWallet);
    console.log('USDC address:', deployedUSDC);
    console.log('Contract version:', version);
    
    if (deployedPlatformWallet.toLowerCase() === platformWallet.toLowerCase()) {
      console.log('✅ Platform wallet verified');
    } else {
      console.log('❌ Platform wallet mismatch');
    }
    
    if (deployedUSDC.toLowerCase() === usdcAddress.toLowerCase()) {
      console.log('✅ USDC address verified');
    } else {
      console.log('❌ USDC address mismatch');
    }
  } catch (error) {
    console.log('⚠️  Contract verification failed:', error.message);
  }

  // Deployment summary
  const deploymentInfo = {
    contractAddress: contractAddress,
    platformWallet: platformWallet,
    usdcAddress: usdcAddress,
    deploymentTransaction: contract.deploymentTransaction().hash,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    network: 'base-mainnet',
    chainId: 8453
  };

  console.log('\n📊 Deployment Summary:');
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log('\n🔧 Environment variables to update:');
  console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET=${contractAddress}`);
  console.log(`NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET=${contractAddress}`);
  console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=${contractAddress}`);
  
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