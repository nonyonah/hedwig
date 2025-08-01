const { ethers } = require('hardhat');

async function main() {
  console.log('Deploying HedwigPayment contract to Base...');

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  // Platform wallet address (replace with actual address)
  const platformWallet = process.env.PLATFORM_WALLET || deployer.address;
  
  // Base chain stablecoin addresses
  const initialTokens = [
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'  // USDbC on Base
  ];

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
    network: 'base'
  };

  console.log('\nDeployment Summary:');
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log('\nAdd this to your .env.local:');
  console.log(`HEDWIG_PAYMENT_CONTRACT_ADDRESS=${hedwigPayment.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });