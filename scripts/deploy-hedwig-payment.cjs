const { ethers } = require('hardhat');

async function main() {
  const network = hre.network.name;
  console.log(`Deploying HedwigPayment contract to ${network}...`);

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);
  console.log('Expected deployer address: 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d');

  // Verify deployer address matches expected
  if (deployer.address.toLowerCase() !== '0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d'.toLowerCase()) {
    console.warn('⚠️  Warning: Deployer address does not match expected address!');
    console.warn(`Expected: 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d`);
    console.warn(`Actual: ${deployer.address}`);
  }

  // Platform wallet address
  const platformWallet = process.env.HEDWIG_PLATFORM_WALLET_TESTNET || process.env.HEDWIG_PLATFORM_WALLET || deployer.address;
  
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

  await hedwigPayment.deployed();

  console.log('HedwigPayment deployed to:', hedwigPayment.address);
  console.log('Platform wallet:', platformWallet);
  console.log('Initial whitelisted tokens:', initialTokens);

  // Verify contract on Basescan (optional)
  if (process.env.BASESCAN_API_KEY) {
    console.log('Waiting for block confirmations...');
    await hedwigPayment.deployTransaction.wait(5);

    try {
      await hre.run('verify:verify', {
        address: hedwigPayment.address,
        constructorArguments: [platformWallet, initialTokens],
      });
      console.log('Contract verified on Basescan');
    } catch (error) {
      console.log('Verification failed:', error.message);
    }
  }

  // Save deployment info
  const deploymentInfo = {
    contractAddress: hedwigPayment.address,
    platformWallet: platformWallet,
    whitelistedTokens: initialTokens,
    deploymentTransaction: hedwigPayment.deployTransaction.hash,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    network: network,
    chainId: network === 'base-sepolia' ? 84532 : 8453
  };

  console.log('\nDeployment Summary:');
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log('\nAdd these to your .env.local:');
  if (network === 'base-sepolia') {
    console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=${hedwigPayment.address}`);
    console.log(`HEDWIG_PLATFORM_WALLET_TESTNET=${platformWallet}`);
    console.log(`BASE_SEPOLIA_RPC_URL=https://sepolia.base.org`);
  } else {
    console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS=${hedwigPayment.address}`);
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