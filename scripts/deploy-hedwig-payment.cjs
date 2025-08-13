const { ethers } = require('hardhat');
const hre = require('hardhat');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const network = hre.network.name;
  console.log(`Deploying HedwigPayment contract to ${network}...`);

  // Debug: Check environment variables
  console.log("PLATFORM_PRIVATE_KEY exists:", !!process.env.PLATFORM_PRIVATE_KEY);
  console.log("BASE_MAINNET_RPC_URL:", process.env.BASE_MAINNET_RPC_URL);

  // Get the deployer account
  const signers = await ethers.getSigners();
  console.log('Available signers:', signers.length);
  
  if (signers.length === 0) {
    throw new Error('No signers available. Please check your PLATFORM_PRIVATE_KEY in .env.local');
  }
  
  const [deployer] = signers;
  const deployerAddress = await deployer.getAddress();
  console.log('Deploying with account:', deployerAddress);
  console.log('Expected deployer address: 0x869a1e10ca4d1e1223676c0a4214c6cc10023244');

  // Verify deployer address matches expected
  if (deployerAddress.toLowerCase() !== '0x869a1e10ca4d1e1223676c0a4214c6cc10023244'.toLowerCase()) {
    console.warn('⚠️  Warning: Deployer address does not match expected address!');
    console.warn(`Expected: 0x869a1e10ca4d1e1223676c0a4214c6cc10023244`);
    console.warn(`Actual: ${deployerAddress}`);
  }

  // Platform wallet address (must be valid, non-zero)
  const platformWallet = process.env.HEDWIG_PLATFORM_WALLET_TESTNET || process.env.HEDWIG_PLATFORM_WALLET || deployerAddress;

  // Deploy the contract (constructor now takes only platformWallet)
  const HedwigPayment = await ethers.getContractFactory('HedwigPayment');
  const hedwigPayment = await HedwigPayment.deploy(platformWallet);

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
        constructorArguments: [platformWallet],
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