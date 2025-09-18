/**
 * Solana client for token transfers
 * This is a placeholder implementation
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Keypair
} from '@solana/web3.js';
import { 
  getOrCreateAssociatedTokenAccount, 
  transfer, 
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress
} from '@solana/spl-token';

// Solana RPC endpoint - use environment variable or default to devnet
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Common SPL token mint addresses (mainnet)
const TOKEN_MINTS: Record<string, string> = {
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'SOL': 'So11111111111111111111111111111111111111112', // Wrapped SOL
};

export async function sendSolanaToken(
  fromAddress: string,
  toAddress: string,
  amount: string,
  tokenMint?: string
): Promise<{ hash: string }> {
  try {
    const fromPubkey = new PublicKey(fromAddress);
    const toPubkey = new PublicKey(toAddress);
    const numericAmount = parseFloat(amount);
    
    // For this implementation, we need a private key to sign transactions
    // In a real app, this would come from a wallet or secure key management
    const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyEnv) {
      throw new Error('SOLANA_PRIVATE_KEY environment variable is required');
    }
    
    // Parse private key from base58 or array format
    let keypair: Keypair;
    try {
      // Try parsing as base58 first
      const privateKeyBytes = Uint8Array.from(JSON.parse(privateKeyEnv));
      keypair = Keypair.fromSecretKey(privateKeyBytes);
    } catch {
      throw new Error('Invalid SOLANA_PRIVATE_KEY format. Expected JSON array of bytes.');
    }
    
    // Verify the keypair matches the fromAddress
    if (keypair.publicKey.toString() !== fromAddress) {
      throw new Error('Private key does not match the from address');
    }

    let transaction: Transaction;
    
    if (!tokenMint) {
      // Native SOL transfer
      const lamports = numericAmount * LAMPORTS_PER_SOL;
      
      transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        })
      );
    } else {
      // SPL Token transfer
      const mint = new PublicKey(tokenMint);
      
      // Get or create associated token accounts
      const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mint,
        fromPubkey
      );
      
      const toTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mint,
        toPubkey
      );
      
      // Create transfer instruction
      // Note: amount should be in the token's smallest unit (e.g., for USDC with 6 decimals, 1 USDC = 1000000)
      const transferInstruction = createTransferInstruction(
        fromTokenAccount.address,
        toTokenAccount.address,
        fromPubkey,
        numericAmount,
        [],
        TOKEN_PROGRAM_ID
      );
      
      transaction = new Transaction().add(transferInstruction);
    }
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;
    
    // Sign and send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );
    
    console.log(`Solana transaction successful: ${signature}`);
    return { hash: signature };
    
  } catch (error) {
    console.error('Solana transaction failed:', error);
    throw new Error(`Solana transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}