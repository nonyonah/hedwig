import { supabase, supabaseAdmin } from './supabaseClient';
import crypto from 'crypto';

/**
 * Execute a direct SQL query using the admin client
 * @param query The SQL query to execute
 * @param params The query parameters
 * @returns The query result
 */
async function executeSql<T = any>(query: string, params: any[] = []): Promise<T | null> {
  try {
    console.log('[WalletDB] Attempting to execute SQL query with RPC');
    
    // Try to use RPC (which will work if the RPC function is defined)
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { 
      sql: query,
      params: JSON.stringify(params)
    });
    
    if (error) {
      console.error('[WalletDB] SQL RPC execution failed:', error);
      
      // If this is an RPC not found error, the function likely doesn't exist in the database
      if (error.code === 'PGRST202') {
        console.error('[WalletDB] The exec_sql function is not defined in your Supabase project.');
        console.error('[WalletDB] Please create this function or use standard queries instead.');
      }
      
      throw error;
    }
    
    return data as T;
  } catch (error) {
    console.error('[WalletDB] Error in executeSql:', error);
    return null;
  }
}

/**
 * Create a user directly with SQL or standard insert
 * @param phoneNumber The user's phone number
 * @returns The user ID
 */
async function createUserWithSql(phoneNumber: string): Promise<string | null> {
  try {
    console.log(`[WalletDB] Creating user for phone number: ${phoneNumber}`);
    
    // Try standard insert first
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([{ phone_number: phoneNumber }])
      .select('id');
    
    if (error) {
      console.warn('[WalletDB] Standard user insert failed:', error);
      
      // Fall back to SQL query
      console.log('[WalletDB] Attempting SQL fallback for user creation');
      
      // Insert the user and return the ID
      const query = `
        INSERT INTO public.users (phone_number, created_at)
        VALUES ($1, NOW())
        RETURNING id
      `;
      
      const result = await executeSql<{id: string}[]>(query, [phoneNumber]);
      
      if (!result || result.length === 0) {
        console.error('[WalletDB] SQL insertion returned no data');
        return null;
      }
      
      const userId = result[0].id;
      console.log(`[WalletDB] Created user with SQL, ID: ${userId}`);
      return userId;
    }
    
    if (!data || data.length === 0) {
      console.error('[WalletDB] Standard insertion returned no data');
      return null;
    }
    
    const userId = data[0].id;
    console.log(`[WalletDB] Created user with standard insert, ID: ${userId}`);
    return userId;
  } catch (error) {
    console.error('[WalletDB] Error creating user:', error);
    return null;
  }
}

/**
 * Create a wallet using standard insert or SQL fallback
 * @param userId The user ID (now stored as TEXT)
 * @param address The wallet address
 * @param encryptedPrivateKey The encrypted private key
 * @returns True if successful, false otherwise
 */
async function createWalletWithSql(userId: string, address: string, encryptedPrivateKey: string): Promise<boolean> {
  try {
    console.log(`[WalletDB] Creating wallet for user ID: ${userId}`);
    
    // Try standard insert first
    const { error } = await supabaseAdmin
      .from('wallets')
      .insert([{
        user_id: userId, // Now stored as TEXT
        address,
        private_key_encrypted: encryptedPrivateKey
      }]);
    
    if (error) {
      console.warn('[WalletDB] Standard wallet insert failed:', error);
      
      // Fall back to SQL query
      console.log('[WalletDB] Attempting SQL fallback for wallet creation');
      
      // Insert the wallet
      const query = `
        INSERT INTO public.wallets (user_id, address, private_key_encrypted, created_at)
        VALUES ($1, $2, $3, NOW())
      `;
      
      await executeSql(query, [userId, address, encryptedPrivateKey]);
    }
    
    console.log(`[WalletDB] Created wallet for user ID: ${userId}`);
    return true;
  } catch (error) {
    console.error('[WalletDB] Error creating wallet:', error);
    return false;
  }
}

/**
 * Get or derive a secure encryption key
 * @returns A secure 32-byte encryption key
 */
function getEncryptionKey(): string {
  let encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
  
  // If no encryption key is set or it's too short, generate a secure one based on other environment variables
  if (!encryptionKey || encryptionKey.length < 32) {
    console.warn('[WalletDB] WALLET_ENCRYPTION_KEY is missing or too short, using a derived key');
    
    // Create a deterministic but secure fallback key using other available environment variables
    // This will be consistent across app restarts as long as the environment stays the same
    const baseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                  process.env.NEXT_PUBLIC_SUPABASE_URL || 
                  'default-hedwig-encryption-key-please-set-wallet-encryption-key';
                  
    // Use crypto.createHash to create a secure 32-byte key
    encryptionKey = crypto.createHash('sha256')
      .update(baseKey)
      .digest('hex');
    
    console.log('[WalletDB] Created fallback encryption key');
  }
  
  return encryptionKey;
}

/**
 * Encrypt a private key using the server's encryption key
 * @param privateKey The private key to encrypt
 * @returns The encrypted private key
 */
function encryptPrivateKey(privateKey: string): string {
  try {
    const encryptionKey = getEncryptionKey();
    
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
    const encryptionKey = getEncryptionKey();
    
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
    if (!phoneNumber) {
      console.error('[WalletDB] Error in getOrCreateUser: phoneNumber parameter is undefined or empty');
      throw new Error('Phone number is required');
    }

    console.log(`[WalletDB] Getting or creating user for phone number: ${phoneNumber}`);
    
    // First check if user exists - use admin client to bypass RLS
    const { data: existingUser, error: fetchError } = await supabaseAdmin
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
    
    // Create new user - use admin client to bypass RLS
    console.log(`[WalletDB] Creating new user for phone number: ${phoneNumber}`);
    
    const { data: newUser, error: createError } = await supabaseAdmin
      .from('users')
      .insert([{ phone_number: phoneNumber }])
      .select('id')
      .single();
    
    if (createError) {
      console.error('[WalletDB] Error creating user:', createError);
      
      // If the admin client insert fails, try createUserWithSql as fallback
      const userId = await createUserWithSql(phoneNumber);
      if (userId) {
        return userId;
      }
      
      throw new Error(`Failed to create user: ${createError.message}`);
    }
    
    if (!newUser) {
      throw new Error('User creation returned no data');
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
    if (!phoneNumber) {
      console.error('[WalletDB] Error checking if user has wallet: phoneNumber parameter is undefined or empty');
      return false;
    }
    
    console.log(`[WalletDB] Checking if user ${phoneNumber} has a wallet in database`);
    
    // Get the user ID - use admin client to bypass RLS
    const { data: user, error: userError } = await supabaseAdmin
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
    
    // Check if the user has a wallet - use admin client to bypass RLS
    // Note: user.id is now stored as TEXT in the wallets table
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('address')
      .eq('user_id', user.id.toString()) // Convert UUID to string to match TEXT column
      .single();
    
    if (walletError && walletError.code !== 'PGRST116') {
      console.error('[WalletDB] Error fetching wallet:', walletError);
      return false;
    }
    
    const hasWallet = !!wallet;
    console.log(`[WalletDB] Database wallet check for user ${phoneNumber}: ${hasWallet ? 'Found' : 'Not found'}`);
    
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
 * @returns True if successful, false otherwise
 */
export async function storeWalletInDb(phoneNumber: string, address: string): Promise<boolean> {
  try {
    if (!phoneNumber) {
      console.error('[WalletDB] Error storing wallet: phoneNumber parameter is undefined or empty');
      return false;
    }
    
    if (!address) {
      console.error('[WalletDB] Error storing wallet: address is missing');
      return false;
    }
    
    console.log(`[WalletDB] Storing wallet for user ${phoneNumber} with address ${address}`);
    
    // Get or create user
    let userId;
    try {
      userId = await getOrCreateUser(phoneNumber);
    } catch (userError) {
      console.error('[WalletDB] Error storing wallet:', userError);
      return false;
    }
    
    // Check if wallet already exists - use admin client to bypass RLS
    const { data: existingWallet, error: fetchError } = await supabaseAdmin
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[WalletDB] Error fetching wallet:', fetchError);
      throw new Error(`Failed to fetch wallet: ${fetchError.message}`);
    }
    
    if (existingWallet) {
      // Update existing wallet - use admin client to bypass RLS
      console.log(`[WalletDB] Updating existing wallet for user ${phoneNumber}`);
      const { error: updateError } = await supabaseAdmin
        .from('wallets')
        .update({
          address,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingWallet.id);
      
      if (updateError) {
        console.error('[WalletDB] Error updating wallet:', updateError);
        throw new Error(`Failed to update wallet: ${updateError.message}`);
      }
    } else {
      // Create new wallet - use admin client to bypass RLS
      console.log(`[WalletDB] Creating new wallet for user ${phoneNumber}`);
      
      try {
        const { error: insertError } = await supabaseAdmin
          .from('wallets')
          .insert([{
            user_id: userId,
            address
          }]);
        
        if (insertError) {
          console.error('[WalletDB] Error inserting wallet:', insertError);
          
          // Special handling for RLS policy violations
          if (insertError.code === '42501' || insertError.message.includes('row-level security policy')) {
            console.error('[WalletDB] RLS policy violation when inserting wallet. Attempting direct SQL approach...');
            
            // Try direct SQL insertion
            const success = await createWalletWithSql(userId, address, '');
            if (success) {
              console.log(`[WalletDB] Successfully created wallet using direct SQL for user ${phoneNumber}`);
              return true;
            }
            
            // If direct SQL fails too
            console.error('[WalletDB] CRITICAL: Both standard and direct SQL approaches failed. Please check Supabase RLS policies.');
            return false;
          }
          
          throw new Error(`Failed to insert wallet: ${insertError.message}`);
        }
      } catch (insertError) {
        console.error('[WalletDB] Exception during wallet insertion:', insertError);
        return false;
      }
    }
    
    console.log(`[WalletDB] Successfully stored wallet for user ${phoneNumber} in database`);
    
    return true;
  } catch (error) {
    console.error('[WalletDB] Error storing wallet:', error);
    return false;
  }
}

/**
 * Get a wallet from the database
 * @param phoneNumber The user's phone number
 * @returns The wallet address or null if not found
 */
export async function getWalletFromDb(phoneNumber: string): Promise<{ address: string } | null> {
  try {
    if (!phoneNumber) {
      console.error('[WalletDB] Error getting wallet: phoneNumber parameter is undefined or empty');
      return null;
    }
    
    console.log(`[WalletDB] Getting wallet for user ${phoneNumber} from database`);
    
    // Get the user ID - use admin client to bypass RLS
    const { data: user, error: userError } = await supabaseAdmin
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
    
    // Get the wallet - use admin client to bypass RLS
    // Note: user.id is now stored as TEXT in the wallets table
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('address')
      .eq('user_id', user.id.toString()) // Convert UUID to string to match TEXT column
      .single();
    
    if (walletError) {
      console.error('[WalletDB] Error fetching wallet:', walletError);
      return null;
    }
    
    if (!wallet) {
      console.log(`[WalletDB] No wallet found for user ${phoneNumber}`);
      return null;
    }
    
    console.log(`[WalletDB] Successfully retrieved wallet for user ${phoneNumber}`);
    
    return { address: wallet.address };
  } catch (error) {
    console.error('[WalletDB] Error getting wallet:', error);
    return null;
  }
} 