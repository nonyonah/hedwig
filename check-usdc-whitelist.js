import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const client = createPublicClient({
  chain: baseSepolia,
  transport: http('https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up')
});

const contractAddress = '0xfd63f4696a505B2aa6b77F578F8031905940072D';
const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const abi = [{
  'inputs': [{'internalType': 'address', 'name': '_token', 'type': 'address'}],
  'name': 'isTokenWhitelisted',
  'outputs': [{'internalType': 'bool', 'name': '', 'type': 'bool'}],
  'stateMutability': 'view',
  'type': 'function'
}];

async function checkUSDCWhitelist() {
  try {
    console.log('Checking USDC whitelist status...');
    console.log('Contract Address:', contractAddress);
    console.log('USDC Address:', usdcAddress);
    
    const result = await client.readContract({
      address: contractAddress,
      abi: abi,
      functionName: 'isTokenWhitelisted',
      args: [usdcAddress]
    });
    
    console.log('USDC Whitelisted:', result);
    
    if (!result) {
      console.log('\n❌ USDC is NOT whitelisted in the contract!');
      console.log('This explains why payments are failing.');
      console.log('\nTo fix this, the contract owner needs to whitelist USDC.');
    } else {
      console.log('\n✅ USDC is properly whitelisted.');
    }
    
  } catch (error) {
    console.error('Error checking USDC whitelist:', error.message);
  }
}

checkUSDCWhitelist();