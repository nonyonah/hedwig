// Calculate error signature for InsufficientAllowance()
import { keccak256, toBytes } from 'viem';

const errorSignature = 'InsufficientAllowance()';
console.log('Calculating error signature for:', errorSignature);

// Calculate the keccak256 hash
const hash = keccak256(toBytes(errorSignature));
console.log('Full hash:', hash);

// Error signature is the first 4 bytes (8 hex characters after 0x)
const signature = hash.slice(0, 10); // 0x + 8 characters
console.log('Error signature:', signature);

// Compare with the error from user
const userErrorSignature = '0xe450d38c';
console.log('User error signature:', userErrorSignature);
console.log('Match:', signature === userErrorSignature);

// Calculate signatures for all errors
const errors = [
  'InvalidAddress()',
  'InvalidAmount()',
  'TransferFailed()',
  'InsufficientAllowance()',
  'Unauthorized()'
];

console.log('\nAll error signatures:');
errors.forEach(error => {
  const hash = keccak256(toBytes(error));
  const sig = hash.slice(0, 10);
  console.log(`${error}: ${sig}`);
});