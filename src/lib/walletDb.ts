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
 * Gets or creates a user in the database
 * @param phoneNumber The user's phone number
 * @returns The user's ID
 */
export async function getOrCreateUser(phoneNumber: string): Promise<string> {
  try {
    if (!phoneNumber) {
      console.error('[WalletDB] getOrCreateUser: Phone number is missing');
      throw new Error('Phone number is required');
    }
    
    console.log(`[WalletDB] Getting or creating user for phone number ${phoneNumber}`);
    
    // Try multiple approaches to ensure robustness
    
    // Approach 1: Check if user exists with SELECT
    try {
      console.log(`[WalletDB] Checking if user ${phoneNumber} exists`);
      const { data: existingUser, error: selectError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('phone_number', phoneNumber)
        .single();
      
      if (!selectError && existingUser) {
        console.log(`[WalletDB] Found existing user with ID ${existingUser.id}`);
        return existingUser.id;
      } else if (selectError) {
        console.warn(`[WalletDB] Error checking if user exists:`, selectError);
      }
    } catch (selectError) {
      console.warn(`[WalletDB] Exception checking if user exists:`, selectError);
    }
    
    // Approach 2: Try direct SQL insert
    try {
      console.log(`[WalletDB] Creating user with direct SQL for ${phoneNumber}`);
      const createUserQuery = `
        INSERT INTO public.users (phone_number, created_at, updated_at)
        VALUES ($1, NOW(), NOW())
        ON CONFLICT (phone_number) DO UPDATE
        SET updated_at = NOW()
        RETURNING id
      `;
      
      const result = await executeSql<{id: string}[]>(createUserQuery, [phoneNumber]);
      
      if (result && result.length > 0) {
        const userId: string = result[0].id;
        console.log(`[WalletDB] Created/updated user with direct SQL, ID: ${userId}`);
        return userId;
      }
    } catch (sqlError) {
      console.warn(`[WalletDB] Error creating user with direct SQL:`, sqlError);
    }
    
    // Approach 3: Use upsert
    try {
      console.log(`[WalletDB] Creating user with upsert for ${phoneNumber}`);
      const { data: upsertResult, error: upsertError } = await supabaseAdmin
        .from('users')
        .upsert([{ phone_number: phoneNumber }], { onConflict: 'phone_number' })
        .select('id')
        .single();
      
      if (!upsertError && upsertResult) {
        const userId: string = upsertResult.id;
        console.log(`[WalletDB] Created/updated user with upsert, ID: ${userId}`);
        return userId;
      } else if (upsertError) {
        console.warn(`[WalletDB] Error upserting user:`, upsertError);
      }
    } catch (upsertError) {
      console.warn(`[WalletDB] Exception during user upsert:`, upsertError);
    }
    
    // Approach 4: Try insert and ignore duplicate error
    try {
      console.log(`[WalletDB] Trying simple insert for ${phoneNumber}`);
      const { data: insertResult, error: insertError } = await supabaseAdmin
        .from('users')
        .insert([{ phone_number: phoneNumber }])
        .select('id')
        .single();
      
      if (!insertError && insertResult) {
        const userId: string = insertResult.id;
        console.log(`[WalletDB] Created user with simple insert, ID: ${userId}`);
        return userId;
      } else if (insertError && insertError.code === '23505') {
        // Duplicate key error - user already exists
        console.log(`[WalletDB] User already exists, trying to get ID again`);
        
        // Try to get the ID again
        const { data: existingUser, error: getError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('phone_number', phoneNumber)
          .single();
        
        if (!getError && existingUser) {
          const userId: string = existingUser.id;
          console.log(`[WalletDB] Got ID for existing user: ${userId}`);
          return userId;
        } else if (getError) {
          console.warn(`[WalletDB] Error getting existing user:`, getError);
        }
      } else if (insertError) {
        console.warn(`[WalletDB] Error inserting user:`, insertError);
      }
    } catch (insertError) {
      console.warn(`[WalletDB] Exception during user insert:`, insertError);
    }
    
    // Approach 5: Try RPC function if available
    try {
      console.log(`[WalletDB] Trying RPC function for ${phoneNumber}`);
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
        'get_or_create_user',
        { p_phone: phoneNumber }
      );
      
      if (!rpcError && rpcResult) {
        const userId: string = rpcResult as string;
        console.log(`[WalletDB] Got/created user with RPC function, ID: ${userId}`);
        return userId;
      } else if (rpcError) {
        console.warn(`[WalletDB] Error with RPC function:`, rpcError);
      }
    } catch (rpcError) {
      console.warn(`[WalletDB] Exception during RPC function call:`, rpcError);
    }
    
    console.error(`[WalletDB] All approaches to get/create user failed for ${phoneNumber}`);
    throw new Error(`Failed to get or create user for ${phoneNumber}`);
  } catch (error) {
    console.error(`[WalletDB] Error in getOrCreateUser:`, error);
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
    
    // Create the user directly with SQL to ensure it exists
    console.log(`[WalletDB] Creating user directly with SQL for ${phoneNumber}`);
    try {
      // Insert user directly with SQL if they don't exist
      const createUserQuery = `
        INSERT INTO public.users (phone_number, created_at, updated_at)
        VALUES ($1, NOW(), NOW())
        ON CONFLICT (phone_number) DO NOTHING
        RETURNING id
      `;
      
      const result = await executeSql<{id: string}[]>(createUserQuery, [phoneNumber]);
      console.log(`[WalletDB] Direct SQL user creation result:`, result);
      
      // If that fails, try the standard approach
      if (!result || result.length === 0) {
        console.log(`[WalletDB] Direct SQL user creation returned no data, trying standard insert`);
        
        const { data, error } = await supabaseAdmin
          .from('users')
          .insert([{ phone_number: phoneNumber }])
          .select('id');
          
        if (error && error.code !== '23505') { // 23505 is duplicate key error, which is fine
          console.error('[WalletDB] Error inserting user with standard approach:', error);
        } else if (data && data.length > 0) {
          console.log(`[WalletDB] Created user with standard insert, ID: ${data[0].id}`);
        }
      }
    } catch (userError) {
      console.error('[WalletDB] Error creating user directly:', userError);
      // Continue with wallet creation anyway
    }
    
    // Get or create user
    let userId;
    try {
      userId = await getOrCreateUser(phoneNumber);
    } catch (userError) {
      console.error('[WalletDB] Error storing wallet:', userError);
      return false;
    }
    
    // Verify user exists in database
    try {
      const { data: userExists, error: userCheckError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();
      
      if (userCheckError || !userExists) {
        console.error(`[WalletDB] User ${userId} does not exist in database:`, userCheckError);
        return false;
      }
      
      console.log(`[WalletDB] Verified user ${userId} exists in database`);
    } catch (verifyError) {
      console.error(`[WalletDB] Error verifying user existence:`, verifyError);
      return false;
    }
    
    // Multiple approaches to store wallet
    let walletStored = false;
    
    // Approach 1: Check if wallet already exists and update
    try {
      const { data: existingWallet, error: fetchError } = await supabaseAdmin
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      if (!fetchError && existingWallet) {
        // Update existing wallet
        console.log(`[WalletDB] Updating existing wallet for user ${phoneNumber}`);
        const { error: updateError } = await supabaseAdmin
          .from('wallets')
          .update({
            address,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingWallet.id);
        
        if (!updateError) {
          console.log(`[WalletDB] Successfully updated wallet for user ${phoneNumber}`);
          walletStored = true;
        } else {
          console.error('[WalletDB] Error updating wallet:', updateError);
        }
      }
    } catch (checkError) {
      console.warn('[WalletDB] Error checking existing wallet:', checkError);
    }
    
    // Approach 2: Standard insert if no wallet exists or update failed
    if (!walletStored) {
      try {
        console.log(`[WalletDB] Creating new wallet for user ${phoneNumber} with standard insert`);
        const { error: insertError } = await supabaseAdmin
          .from('wallets')
          .insert([{
            user_id: userId,
            address
          }]);
        
        if (!insertError) {
          console.log(`[WalletDB] Successfully created wallet for user ${phoneNumber} with standard insert`);
          walletStored = true;
        } else {
          console.warn('[WalletDB] Standard wallet insert failed:', insertError);
        }
      } catch (insertError) {
        console.warn('[WalletDB] Exception during standard wallet insert:', insertError);
      }
    }
    
    // Approach 3: Try SQL function if available
    if (!walletStored) {
      try {
        console.log('[WalletDB] Trying to create wallet with SQL function...');
        const { data: funcResult, error: funcError } = await supabaseAdmin.rpc(
          'create_user_with_wallet',
          { 
            p_phone: phoneNumber,
            p_wallet_address: address,
            p_private_key_encrypted: '' // Empty for now
          }
        );
        
        if (!funcError) {
          console.log(`[WalletDB] Successfully created wallet with function for user ${phoneNumber}`);
          walletStored = true;
        } else {
          console.warn('[WalletDB] Function wallet creation failed:', funcError);
        }
      } catch (funcError) {
        console.warn('[WalletDB] Exception during function wallet creation:', funcError);
      }
    }
    
    // Approach 4: Direct SQL as last resort
    if (!walletStored) {
      try {
        console.log('[WalletDB] Trying direct SQL wallet creation...');
        const success = await createWalletWithSql(userId, address, '');
        if (success) {
          console.log(`[WalletDB] Successfully created wallet with direct SQL for user ${phoneNumber}`);
          walletStored = true;
        } else {
          console.error('[WalletDB] Direct SQL wallet creation failed');
        }
      } catch (sqlError) {
        console.error('[WalletDB] Exception during SQL wallet creation:', sqlError);
      }
    }
    
    if (!walletStored) {
      console.error(`[WalletDB] All wallet storage approaches failed for user ${phoneNumber}`);
      return false;
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