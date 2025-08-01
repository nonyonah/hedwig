const { ethers } = require('hardhat');
const hre = require('hardhat');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const network = hre.network.name;
  console.log(`Deploying HedwigPayment contract to ${network}...`);

  // Debug: Check environment variables
  console.log("PLATFORM_PRIVATE_KEY exists:", !!process.env.PLATFORM_PRIVATE_KEY);
  console.log("BASE_SEPOLIA_RPC_URL:", process.env.BASE_SEPOLIA_RPC_URL);

  // Get the deployer account
  const signers = await ethers.getSigners();
  console.log('Available signers:', signers.length);
  
  if (signers.length === 0) {
    throw new Error('No signers available. Please check your PLATFORM_PRIVATE_KEY in .env.local');
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

  // Platform wallet address
  const platformWallet = process.env.HEDWIG_PLATFORM_WALLET_TESTNET || process.env.HEDWIG_PLATFORM_WALLET || deployerAddress;
  
  // Token addresses based on network
  let initialTokens;
  if (network === 'base-sepolia') {
    // Base Sepolia testnet token addresses
    initialTokens = [
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
      '0x4A3A6Dd60A34bB2Aba60D73B4C88315E9CeB6A3D'  // Mock USDT on Base Sepolia (if available)
    ];
  } else {
    // Base mainnet token addresses
    initialTokens = [
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'  // USDbC on Base
    ];
  }

  // Deploy the contract
  const HedwigPayment = await ethers.getContractFactory('HedwigPayment');
  const hedwigPayment = await HedwigPayment.deploy(platformWallet, initialTokens);

  await hedwigPayment.waitForDeployment();

  console.log('HedwigPayment deployed to:', await hedwigPayment.getAddress());
  console.log('Platform wallet:', platformWallet);
  console.log('Initial whitelisted tokens:', initialTokens);

  // Get contract address
  const contractAddress = await hedwigPayment.getAddress();

  // Verify contract on Basescan (optional)
  if (process.env.BASESCAN_API_KEY) {
    console.log('Waiting for block confirmations...');
    await hedwigPayment.deploymentTransaction().wait(5);

    try {
      await hre.run('verify:verify', {
        address: contractAddress,
        constructorArguments: [platformWallet, initialTokens],
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
    whitelistedTokens: initialTokens,
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