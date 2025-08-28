import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// USDC contract address on Base Sepolia
const USDC_CONTRACT_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// User's wallet address
const USER_ADDRESS = '0x869a1E10cA4d1e1223676C0a4214C6cC10023244';

// Create a public client for Base Sepolia
const client = createPublicClient({
  chain: baseSepolia,
  transport: http()
});

// ERC20 ABI for balanceOf function
const ERC20_ABI = [
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function debugWalletConnection() {
  try {
    console.log('=== Wallet Connection Debug ===');
    console.log('User Address:', USER_ADDRESS);
    console.log('USDC Contract:', USDC_CONTRACT_ADDRESS);
    console.log('Chain: Base Sepolia');
    console.log('');
    
    // Check USDC balance
    console.log('Checking USDC balance...');
    const balance = await client.readContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [USER_ADDRESS]
    });
    
    // Convert from wei (6 decimals for USDC) to human readable
    const balanceInUsdc = Number(balance) / Math.pow(10, 6);
    
    console.log('Raw balance (wei):', balance.toString());
    console.log('Balance in USDC:', balanceInUsdc);
    console.log('');
    
    // Check if address is valid
    if (!USER_ADDRESS.startsWith('0x') || USER_ADDRESS.length !== 42) {
      console.error('❌ Invalid wallet address format');
      return;
    }
    
    if (balanceInUsdc > 0) {
      console.log('✅ Wallet has USDC balance:', balanceInUsdc, 'USDC');
    } else {
      console.log('❌ Wallet has 0 USDC balance');
    }
    
    // Additional debugging info
    console.log('');
    console.log('=== Debugging Tips ===');
    console.log('1. Make sure the wallet is connected to Base Sepolia network');
    console.log('2. Verify the connected wallet address matches:', USER_ADDRESS);
    console.log('3. Check if OnchainKit and wagmi are using the same wallet connection');
    console.log('4. Ensure the wallet connection state is properly synced');
    
  } catch (error) {
    console.error('Error checking wallet connection:', error);
  }
}

debugWalletConnection();