// Test script to verify fee estimation
const { estimateTransactionFee } = require('./src/lib/cdp.ts');

async function testFeeEstimation() {
  console.log('Testing fee estimation...');
  
  try {
    // Test Solana native transaction
    console.log('\n--- Testing Solana Native (SOL) ---');
    const solNativeFee = await estimateTransactionFee('solana-devnet', 'native');
    console.log('Solana native fee:', solNativeFee);
    
    // Test Solana token transaction
    console.log('\n--- Testing Solana Token (USDC) ---');
    const solTokenFee = await estimateTransactionFee('solana-devnet', 'token');
    console.log('Solana token fee:', solTokenFee);
    
    // Test Base Sepolia native transaction
    console.log('\n--- Testing Base Sepolia Native (ETH) ---');
    const baseFee = await estimateTransactionFee('base-sepolia', 'native');
    console.log('Base Sepolia native fee:', baseFee);
    
    // Test Base Sepolia token transaction
    console.log('\n--- Testing Base Sepolia Token (USDC) ---');
    const baseTokenFee = await estimateTransactionFee('base-sepolia', 'token');
    console.log('Base Sepolia token fee:', baseTokenFee);
    
    console.log('\n--- Test Results ---');
    console.log('Solana fees should contain "SOL":', solNativeFee.includes('SOL'), solTokenFee.includes('SOL'));
    console.log('Base fees should contain "ETH":', baseFee.includes('ETH'), baseTokenFee.includes('ETH'));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testFeeEstimation();