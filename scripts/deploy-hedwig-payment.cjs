const { ethers } = require('hardhat');
const hre = require('hardhat');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const network = hre.network.name;
  console.log(`Deploying HedwigPayment contract to ${network}...`);

  // Debug: Check environment variables
  console.log("PLATFORM_PRIVATE_KEY exists:", !!process.env.DEPLOYER_PRIVATE_KEY);
  console.log("BASE_MAINNET_RPC_URL:", process.env.BASE_MAINNET_RPC_URL);

  // Get the deployer account
  const signers = await ethers.getSigners();
  console.log('Available signers:', signers.length);
  
  if (signers.length === 0) {
    throw new Error('No signers available. Please check your DEPLOYER_PRIVATE_KEY in .env.local');
  }
  
  const [deployer] = signers;
  const deployerAddress = await deployer.getAddress();
  console.log('Deploying with account:', deployerAddress);
  console.log('Expected deployer address: 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d');

  // Verify deployer address matches expected
  if (deployerAddress.toLowerCase() !== '0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d'.toLowerCase()) {
    console.warn('⚠️  Warning: Deployer address does not match expected address!');
    console.warn(`Expected: 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d`);
    console.warn(`Actual: ${deployerAddress}`);
  }

  // Platform wallet address (must be valid, non-zero)
  const platformWallet = network === 'base-sepolia' 
    ? (process.env.HEDWIG_PLATFORM_WALLET_TESTNET || '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc')
    : (process.env.HEDWIG_PLATFORM_WALLET_MAINNET || '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc');
  
  // USDC address for the network
  const usdcAddress = network === 'base-sepolia'
    ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC

  console.log('Platform wallet:', platformWallet);
  console.log('Expected platform wallet: 0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc');
  console.log('USDC address:', usdcAddress);

  // Verify platform wallet matches expected
  if (platformWallet.toLowerCase() !== '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc'.toLowerCase()) {
    console.warn('⚠️  Warning: Platform wallet does not match expected address!');
    console.warn(`Expected: 0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc`);
    console.warn(`Actual: ${platformWallet}`);
  }

  // Deploy the contract (constructor takes platformWallet and usdcAddress)
  const HedwigPayment = await ethers.getContractFactory('HedwigPayment');
  const hedwigPayment = await HedwigPayment.deploy(platformWallet, usdcAddress);

  await hedwigPayment.waitForDeployment();

  console.log('HedwigPayment deployed to:', await hedwigPayment.getAddress());
  console.log('Platform wallet:', platformWallet);

  // Get contract address
  const contractAddress = await hedwigPayment.getAddress();

  // Verify contract on Basescan (optional)
  if (process.env.BASESCAN_API_KEY) {
    console.log('Waiting for block confirmations...');
    await hedwigPayment.deploymentTransaction().wait(5);

    try {
      await hre.run('verify:verify', {
        address: contractAddress,
        constructorArguments: [platformWallet, usdcAddress],
      });
      console.log('Contract verified on Basescan');
    } catch (error) {
      console.log('Verification failed:', error.message);
    }
  }

  // Save deployment info
  const deploymentInfo = {
    contractAddress: contractAddress,
    platformWallet: platformWallet,
    deploymentTransaction: hedwigPayment.deploymentTransaction().hash,
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    network: network,
    chainId: network === 'base-sepolia' ? 84532 : 8453
  };

  console.log('\nDeployment Summary:');
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log('\nAdd these to your .env.local:');
  if (network === 'base-sepolia') {
    console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=${contractAddress}`);
    console.log(`HEDWIG_PLATFORM_WALLET_TESTNET=${platformWallet}`);
    console.log(`BASE_SEPOLIA_RPC_URL=https://sepolia.base.org`);
  } else {
    console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS=${contractAddress}`);
    console.log(`HEDWIG_PLATFORM_WALLET=${platformWallet}`);
    console.log(`BASE_RPC_URL=https://mainnet.base.org`);
  }
  
  // Generate admin key if not exists
  if (!process.env.HEDWIG_ADMIN_KEY) {
    const adminKey = require('crypto').randomBytes(32).toString('hex');
    console.log(`HEDWIG_ADMIN_KEY=${adminKey}`);
    console.log('\n⚠️  IMPORTANT: Save the admin key securely! It\'s needed for contract management.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });