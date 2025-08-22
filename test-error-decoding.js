// Test script to verify error signature decoding
import { decodeErrorResult } from 'viem';

// Updated ABI with error definitions
const HEDWIG_PAYMENT_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "freelancer",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "invoiceId",
        "type": "string"
      }
    ],
    "name": "pay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientAllowance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "Unauthorized",
    "type": "error"
  }
];

console.log('Testing error signature decoding...');

try {
  // Test decoding the error signature 0xe450d38c
  const result = decodeErrorResult({
    abi: HEDWIG_PAYMENT_ABI,
    data: '0xe450d38c' // The error signature from the user's error message
  });
  
  console.log('✅ Successfully decoded error:', result);
  console.log('Error name:', result.errorName);
  console.log('Error args:', result.args);
} catch (error) {
  console.error('❌ Failed to decode error:', error.message);
}

// Test all error signatures
const errorTests = [
  { name: 'InvalidAddress', signature: '0xe6c4247b' },
  { name: 'InvalidAmount', signature: '0x2c5211c6' },
  { name: 'TransferFailed', signature: '0x90b8ec18' },
  { name: 'InsufficientAllowance', signature: '0xe450d38c' },
  { name: 'Unauthorized', signature: '0x82b42900' }
];

console.log('\nTesting all error signatures:');
errorTests.forEach(test => {
  try {
    const result = decodeErrorResult({
      abi: HEDWIG_PAYMENT_ABI,
      data: test.signature
    });
    console.log(`✅ ${test.name}: ${test.signature} -> ${result.errorName}`);
  } catch (error) {
    console.log(`❌ ${test.name}: ${test.signature} -> Failed to decode`);
  }
});