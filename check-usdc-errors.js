import { createPublicClient, http, decodeErrorResult, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';

// Create a public client
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.mainnet.alchemyapi.io/v2/demo')
});

// USDC contract address
const USDC_ADDRESS = '0xA0b86a33E6441b8435b662303c0f479c7e1d5a4e';

// Common ERC20 ABI with standard errors
const ERC20_ABI = [
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      { "name": "from", "type": "address" },
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  // Standard ERC20 errors
  {
    "type": "error",
    "name": "ERC20InsufficientBalance",
    "inputs": [
      { "name": "sender", "type": "address" },
      { "name": "balance", "type": "uint256" },
      { "name": "needed", "type": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientAllowance",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "allowance", "type": "uint256" },
      { "name": "needed", "type": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSender",
    "inputs": [{ "name": "sender", "type": "address" }]
  },
  {
    "type": "error",
    "name": "ERC20InvalidReceiver",
    "inputs": [{ "name": "receiver", "type": "address" }]
  },
  {
    "type": "error",
    "name": "ERC20InvalidApprover",
    "inputs": [{ "name": "approver", "type": "address" }]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSpender",
    "inputs": [{ "name": "spender", "type": "address" }]
  }
];

async function checkErrorSignature() {
  console.log('Checking error signature 0xe450d38c...');
  
  // Try to decode the error with standard ERC20 errors
  const errorData = '0xe450d38c';
  
  try {
    const decoded = decodeErrorResult({
      abi: ERC20_ABI,
      data: errorData
    });
    console.log('Decoded error:', decoded);
  } catch (error) {
    console.log('Failed to decode with standard ERC20 ABI:', error.message);
  }
  
  // Calculate signatures for standard ERC20 errors
  
  const errorSignatures = [
    'ERC20InsufficientBalance(address,uint256,uint256)',
    'ERC20InsufficientAllowance(address,uint256,uint256)',
    'ERC20InvalidSender(address)',
    'ERC20InvalidReceiver(address)',
    'ERC20InvalidApprover(address)',
    'ERC20InvalidSpender(address)'
  ];
  
  console.log('\nStandard ERC20 error signatures:');
  errorSignatures.forEach(sig => {
    const hash = keccak256(toHex(sig));
    const signature = hash.slice(0, 10); // First 4 bytes
    console.log(`${sig}: ${signature}`);
  });
  
  // Check if 0xe450d38c matches any known patterns
  console.log('\nLooking for signature 0xe450d38c...');
  const targetSignature = '0xe450d38c';
  
  // Try some common error patterns
  const commonErrors = [
    'Error(string)',
    'Panic(uint256)',
    'InsufficientBalance()',
    'InsufficientAllowance()',
    'TransferFailed()',
    'InvalidAmount()',
    'Unauthorized()'
  ];
  
  console.log('\nCommon error signatures:');
  commonErrors.forEach(sig => {
    const hash = keccak256(toHex(sig));
    const signature = hash.slice(0, 10);
    console.log(`${sig}: ${signature}`);
    if (signature === targetSignature) {
      console.log(`*** MATCH FOUND: ${sig} ***`);
    }
  });
}

checkErrorSignature().catch(console.error);