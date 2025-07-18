/**
 * Script to get test USDC tokens on Solana devnet
 * 
 * This script helps you:
 * 1. Check if you have USDC token accounts
 * 2. Create an Associated Token Account (ATA) for USDC if needed
 * 3. Get test USDC from Circle's devnet faucet
 * 
 * Usage: node scripts/get-devnet-usdc.js <wallet-address>
 */

const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');

const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Circle's official devnet USDC

async function checkUSDCBalance(walletAddress) {
  try {
    console.log('🔍 Checking USDC balance for:', walletAddress);
    console.log('📍 Using USDC mint:', USDC_MINT_DEVNET);
    
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    const publicKey = new PublicKey(walletAddress);
    const usdcMint = new PublicKey(USDC_MINT_DEVNET);
    
    // Check SOL balance first
    const solBalance = await connection.getBalance(publicKey);
    console.log('💰 SOL Balance:', solBalance / 1e9, 'SOL');
    
    // Check for USDC token accounts
    const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      mint: usdcMint,
    });
    
    console.log('🏦 USDC Token Accounts found:', tokenAccounts.value.length);
    
    if (tokenAccounts.value.length > 0) {
      for (let i = 0; i < tokenAccounts.value.length; i++) {
        const account = tokenAccounts.value[i];
        const balance = await connection.getTokenAccountBalance(account.pubkey);
        console.log(`💵 USDC Account ${i + 1}:`, {
          address: account.pubkey.toString(),
          balance: balance.value.uiAmount || 0,
          rawAmount: balance.value.amount
        });
      }
    } else {
      console.log('❌ No USDC token accounts found');
      console.log('');
      console.log('📝 To get test USDC:');
      console.log('1. Visit: https://usdcfaucet.com/');
      console.log('2. Select "Solana Devnet"');
      console.log('3. Enter your wallet address:', walletAddress);
      console.log('4. Request test USDC tokens');
      console.log('');
      console.log('🔄 Alternative: Use Circle\'s devnet faucet');
      console.log('   https://developers.circle.com/developer/docs/usdc-on-testnet#usdc-on-solana-testnet');
    }
    
    // Show all token accounts for debugging
    const allTokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });
    
    console.log('');
    console.log('🔍 All token accounts for this wallet:', allTokenAccounts.value.length);
    for (const account of allTokenAccounts.value) {
      try {
        const balance = await connection.getTokenAccountBalance(account.pubkey);
        if (parseFloat(balance.value.amount) > 0) {
          console.log('  📊', account.pubkey.toString(), '- Balance:', balance.value.uiAmount || balance.value.amount);
        }
      } catch (e) {
        // Skip accounts we can't read
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Get wallet address from command line arguments
const walletAddress = process.argv[2];

if (!walletAddress) {
  console.log('Usage: node scripts/get-devnet-usdc.js <wallet-address>');
  console.log('Example: node scripts/get-devnet-usdc.js 83astBRguLMdt2h5U1Tpdq5tjFoJ6noeGwaY3mDLVcri');
  process.exit(1);
}

checkUSDCBalance(walletAddress);