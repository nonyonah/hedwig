import { supabase } from './supabaseClient';
import { getCachedWalletCredentials, cacheWalletCredentials } from './wallet';
import crypto from 'crypto';

/**
 * Encrypt a private key using the server's encryption key
 * @param privateKey The private key to encrypt
 * @returns The encrypted private key
 */
function encryptPrivateKey(privateKey: string): string {
  try {
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Invalid encryption key');
    }
    
    // Use a secure encryption algorithm (AES-256-GCM)
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm', 
      Buffer.from(encryptionKey.slice(0, 32)), 
      iv
    );
    
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the auth tag
    const authTag = cipher.getAuthTag();
    
    // Return IV + Auth Tag + Encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Error encrypting private key:', error);
    throw new Error('Failed to encrypt private key');
  }
}

/**
 * Decrypt an encrypted private key
 * @param encryptedKey The encrypted private key
 * @returns The decrypted private key
 */
function decryptPrivateKey(encryptedKey: string): string {
  try {
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Invalid encryption key');
    }
    
    // Split the stored data
    const parts = encryptedKey.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted key format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(encryptionKey.slice(0, 32)),
      iv
    );
    
    // Set auth tag
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting private key:', error);
    throw new Error('Failed to decrypt private key');
  }
}

/**
 * Get or create a user in the database
 * @param phoneNumber The user's phone number
 * @returns The user ID
 */
export async function getOrCreateUser(phoneNumber: string): Promise<string> {
  try {
    console.log(`[WalletDB] Getting or creating user for phone number: ${phoneNumber}`);
    
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', phoneNumber)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('[WalletDB] Error fetching user:', fetchError);
      throw new Error(`Failed to fetch user: ${fetchError.message}`);
    }
    
    // If user exists, return their ID
    if (existingUser) {
      console.log(`[WalletDB] Found existing user with ID: ${existingUser.id}`);
      return existingUser.id;
    }
    
    // Create new user
    console.log(`[WalletDB] Creating new user for phone number: ${phoneNumber}`);
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ phone_number: phoneNumber }])
      .select('id')
      .single();
    
    if (createError || !newUser) {
      console.error('[WalletDB] Error creating user:', createError);
      throw new Error(`Failed to create user: ${createError?.message || 'Unknown error'}`);
    }
    
    console.log(`[WalletDB] Created new user with ID: ${newUser.id}`);
    return newUser.id;
  } catch (error) {
    console.error('[WalletDB] Error in getOrCreateUser:', error);
    throw error;
  }
}

/**
 * Check if a user has a wallet in the database
 * @param phoneNumber The user's phone number
 * @returns True if the user has a wallet, false otherwise
 */
export async function userHasWalletInDb(phoneNumber: string): Promise<boolean> {
  try {
    console.log(`[WalletDB] Checking if user ${phoneNumber} has a wallet in database`);
    
    // First check the in-memory cache
    const cachedWallet = getCachedWalletCredentials(phoneNumber);
    if (cachedWallet) {
      console.log(`[WalletDB] Found wallet in cache for user ${phoneNumber}`);
      return true;
    }
    
    // Get the user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', phoneNumber)
      .single();
    
    if (userError && userError.code !== 'PGRST116') {
      console.error('[WalletDB] Error fetching user:', userError);
      return false;
    }
    
    if (!user) {
      console.log(`[WalletDB] No user found for phone number: ${phoneNumber}`);
      return false;
    }
    
    // Check if the user has a wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('address, private_key_encrypted')
      .eq('user_id', user.id)
      .single();
    
    if (walletError && walletError.code !== 'PGRST116') {
      console.error('[WalletDB] Error fetching wallet:', walletError);
      return false;
    }
    
    const hasWallet = !!wallet;
    console.log(`[WalletDB] Database wallet check for user ${phoneNumber}: ${hasWallet ? 'Found' : 'Not found'}`);
    
    // If we found a wallet in the database but not in cache, add it to cache
    if (hasWallet && wallet) {
      try {
        const privateKey = decryptPrivateKey(wallet.private_key_encrypted);
        cacheWalletCredentials(phoneNumber, privateKey, wallet.address);
        console.log(`[WalletDB] Added wallet from database to cache for user ${phoneNumber}`);
      } catch (decryptError) {
        console.error('[WalletDB] Error decrypting private key:', decryptError);
      }
    }
    
    return hasWallet;
  } catch (error) {
    console.error('[WalletDB] Error checking if user has wallet:', error);
    return false;
  }
}

/**
 * Store a wallet in the database
 * @param phoneNumber The user's phone number
 * @param address The wallet address
 * @param privateKey The wallet private key
 * @returns True if successful, false otherwise
 */
export async function storeWalletInDb(phoneNumber: string, address: string, privateKey: string): Promise<boolean> {
  try {
    console.log(`[WalletDB] Storing wallet for user ${phoneNumber} with address ${address}`);
    
    // Get or create user
    const userId = await getOrCreateUser(phoneNumber);
    
    // Encrypt the private key
    const encryptedPrivateKey = encryptPrivateKey(privateKey);
    
    // Check if wallet already exists
    const { data: existingWallet, error: fetchError } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[WalletDB] Error fetching wallet:', fetchError);
      throw new Error(`Failed to fetch wallet: ${fetchError.message}`);
    }
    
    if (existingWallet) {
      // Update existing wallet
      console.log(`[WalletDB] Updating existing wallet for user ${phoneNumber}`);
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          address,
          private_key_encrypted: encryptedPrivateKey,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingWallet.id);
      
      if (updateError) {
        console.error('[WalletDB] Error updating wallet:', updateError);
        throw new Error(`Failed to update wallet: ${updateError.message}`);
      }
    } else {
      // Create new wallet
      console.log(`[WalletDB] Creating new wallet for user ${phoneNumber}`);
      const { error: insertError } = await supabase
        .from('wallets')
        .insert([{
          user_id: userId,
          address,
          private_key_encrypted: encryptedPrivateKey
        }]);
      
      if (insertError) {
        console.error('[WalletDB] Error creating wallet:', insertError);
        throw new Error(`Failed to create wallet: ${insertError.message}`);
      }
    }
    
    // Also update the in-memory cache
    cacheWalletCredentials(phoneNumber, privateKey, address);
    
    console.log(`[WalletDB] Successfully stored wallet for user ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('[WalletDB] Error storing wallet:', error);
    return false;
  }
}

/**
 * Get a wallet from the database
 * @param phoneNumber The user's phone number
 * @returns The wallet credentials or null if not found
 */
export async function getWalletFromDb(phoneNumber: string): Promise<{ address: string; privateKey: string } | null> {
  try {
    console.log(`[WalletDB] Getting wallet for user ${phoneNumber}`);
    
    // First check the in-memory cache
    const cachedWallet = getCachedWalletCredentials(phoneNumber);
    if (cachedWallet) {
      console.log(`[WalletDB] Found wallet in cache for user ${phoneNumber}`);
      return {
        address: cachedWallet.address,
        privateKey: cachedWallet.privateKey
      };
    }
    
    // Get the user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', phoneNumber)
      .single();
    
    if (userError) {
      console.error('[WalletDB] Error fetching user:', userError);
      return null;
    }
    
    if (!user) {
      console.log(`[WalletDB] No user found for phone number: ${phoneNumber}`);
      return null;
    }
    
    // Get the wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('address, private_key_encrypted')
      .eq('user_id', user.id)
      .single();
    
    if (walletError) {
      console.error('[WalletDB] Error fetching wallet:', walletError);
      return null;
    }
    
    if (!wallet) {
      console.log(`[WalletDB] No wallet found for user ${phoneNumber}`);
      return null;
    }
    
    // Decrypt the private key
    try {
      const privateKey = decryptPrivateKey(wallet.private_key_encrypted);
      
      // Update the in-memory cache
      cacheWalletCredentials(phoneNumber, privateKey, wallet.address);
      
      console.log(`[WalletDB] Successfully retrieved wallet for user ${phoneNumber}`);
      return {
        address: wallet.address,
        privateKey
      };
    } catch (decryptError) {
      console.error('[WalletDB] Error decrypting private key:', decryptError);
      return null;
    }
  } catch (error) {
    console.error('[WalletDB] Error getting wallet:', error);
    return null;
  }
} 