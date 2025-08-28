import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const client = createPublicClient({
  chain: baseSepolia,
  transport: http()
});

// USDC contract address on Base Sepolia
const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// ERC20 ABI for balanceOf function
const erc20Abi = [{
  "inputs": [{"name": "account", "type": "address"}],
  "name": "balanceOf",
  "outputs": [{"name": "", "type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
}];

// Function to check USDC balance for a given address
async function checkUsdcBalance(userAddress) {
  try {
    console.log('Checking USDC balance...');
    console.log('User Address:', userAddress);
    console.log('USDC Contract:', usdcAddress);
    
    const balance = await client.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [userAddress]
    });
    
    // USDC has 6 decimals
    const balanceFormatted = Number(balance) / 1000000;
    
    console.log('Raw Balance:', balance.toString());
    console.log('Formatted Balance:', balanceFormatted, 'USDC');
    
    if (balance === 0n) {
      console.log('❌ User has 0 USDC balance');
    } else {
      console.log('✅ User has USDC balance:', balanceFormatted);
    }
    
    return balance;
  } catch (error) {
    console.error('Error checking USDC balance:', error.message);
    return null;
  }
}

// User's wallet address
const userAddress = '0x869a1E10cA4d1e1223676C0a4214C6cC10023244';

if (!userAddress) {
  console.log('Usage: node check-user-usdc-balance.js <wallet_address>');
  console.log('Example: node check-user-usdc-balance.js 0x1234567890123456789012345678901234567890');
  process.exit(1);
}

if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
  console.error('Invalid wallet address format');
  process.exit(1);
}

checkUsdcBalance(userAddress);