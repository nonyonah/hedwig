// Simple test script to verify payment link creation fixes
import { parseIntentAndParams } from './src/lib/intentParser.js';

// Test cases
const testCases = [
  "Create payment link for 1 usdc on base for web development", // The exact case from logs
  "create payment link for 50 USDC",
  "payment link $100 for consulting",
  "create payment link for web development",
  "payment link 25 USDC on celo for design work, send to client@example.com",
  "john@example.com", // This should NOT trigger send intent
  "send 50 USDC to 0x123...", // This SHOULD trigger send intent
  "create payment link",
  "payment link for freelance work"
];

console.log('Testing Payment Link Intent Detection:\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: "${testCase}"`);
  try {
    const result = parseIntentAndParams(testCase);
    console.log(`  Intent: ${result.intent}`);
    console.log(`  Params:`, JSON.stringify(result.params, null, 2));
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
  console.log('');
});