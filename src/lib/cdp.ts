import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const CDP_API_URL = "https://api.cdp.coinbase.com/v2";
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment variables.",
  );
}

if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
  throw new Error(
    "CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set in your environment variables.",
  );
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// CDP API types
export interface CDPWallet {
  id: string;
  address: string;
  network: string;
}

export interface CDPBalance {
  asset: {
    symbol: string;
    name: string;
    decimals: number;
    address?: string;
  };
  balance: string;
  balanceUsd?: string;
}

export interface CDPTransaction {
  id: string;
  hash: string;
  status: string;
  from: string;
  to: string;
  value: string;
  gasPrice?: string;
  gasLimit?: string;
  gasUsed?: string;
  nonce?: number;
  data?: string;
  createdAt: string;
  updatedAt: string;
  asset?: {
    symbol?: string;
    name?: string;
    decimals?: number;
    address?: string;
  };
}

/**
 * Generate JWT token for CDP API authentication
 * @param method The HTTP method
 * @param path The request path
 * @param body Optional request body
 * @returns The JWT token
 */
async function generateJWT(method: string, path: string, body?: any): Promise<string> {
  try {
    console.log(`Generating JWT for ${method} ${path}`);
    
    if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
      throw new Error("CDP API credentials not configured");
    }
    
    // Create timestamp (seconds since epoch)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Create a random nonce (jti)
    const jti = crypto.randomBytes(16).toString('hex');
    
    // Create the URI claim
    const uri = `${method} api.cdp.coinbase.com${path}`;
    
    // Create the JWT header
    const header = {
      alg: "HS256",
      typ: "JWT"
    };
    
    // Create the JWT payload
    const payload: Record<string, any> = {
      iat: timestamp,
      nbf: timestamp,
      exp: parseInt(timestamp) + 120, // Token valid for 2 minutes
      sub: CDP_API_KEY_ID,
      iss: "cdp-api",
      jti: jti,
      uris: [uri]
    };
    
    // Add request body to payload if provided
    if (body) {
      payload.req = body;
    }
    
    // Encode header and payload
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Create the signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createHmac('sha256', CDP_API_KEY_SECRET)
      .update(signatureInput)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Combine to create the JWT
    const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;
    
    return jwt;
  } catch (error) {
    console.error("Error generating JWT:", error);
    throw error;
  }
}

/**
 * Create a new wallet in CDP
 * @param network The network for the wallet (e.g., "base-sepolia", "solana-devnet")
 * @returns The created wallet information
 */
export async function createWallet(network: string): Promise<CDPWallet> {
  console.log(`Creating wallet on network ${network}`);
  
  // Log environment variables (masked for security)
  console.log(`CDP API URL: ${CDP_API_URL}`);
  console.log(`CDP API Key ID: ${CDP_API_KEY_ID ? CDP_API_KEY_ID.substring(0, 4) + '...' : 'MISSING'}`);
  console.log(`CDP API Secret: ${CDP_API_KEY_SECRET ? 'Present (length: ' + CDP_API_KEY_SECRET.length + ')' : 'MISSING'}`);
  
  // Try up to 3 times
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`Attempt ${attempts}/${maxAttempts} to create wallet on ${network}`);
    
    try {
      // Request path and body
      const path = "/accounts";
      const body = { network };
      
      // Generate JWT token for authentication
      const jwt = await generateJWT("POST", path, body);
      
      const response = await fetch(`${CDP_API_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`,
        },
        body: JSON.stringify(body),
      });

      // Log full response for debugging
      console.log(`CDP API response status: ${response.status}`);
      console.log(`CDP API response status text: ${response.statusText}`);
      
      const responseText = await response.text();
      console.log(`CDP API response body: ${responseText}`);
      
      // Try to parse as JSON if possible
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e: unknown) {
        console.log(`Response is not JSON: ${e instanceof Error ? e.message : String(e)}`);
        result = { message: responseText || "Unknown error" };
      }
      
      if (!response.ok) {
        console.error(`CDP API error (createWallet): Status ${response.status}`, result);
        console.error(`API Keys used: ${CDP_API_KEY_ID ? "ID Present" : "ID Missing"}, ${CDP_API_KEY_SECRET ? "Secret Present" : "Secret Missing"}`);
        
        // If this is not the last attempt, wait and try again
        if (attempts < maxAttempts) {
          console.log(`Waiting 1 second before retry...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        throw new Error(
          `Failed to create wallet: ${result.message || response.statusText}`,
        );
      }
      
      console.log(`Successfully created wallet with address: ${result.address || 'unknown'}`);
      return {
        id: result.id || result.address,
        address: result.address,
        network: network
      };
    } catch (error) {
      console.error(`Error in createWallet attempt ${attempts}:`, error);
      
      // If this is not the last attempt, wait and try again
      if (attempts < maxAttempts) {
        console.log(`Waiting 1 second before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      throw error;
    }
  }
  
  // This should never be reached due to the throw in the loop
  throw new Error(`Failed to create wallet after ${maxAttempts} attempts`);
}

/**
 * Get balances for an address
 * @param address The wallet address
 * @param network The network (e.g., "base-sepolia", "solana-devnet")
 * @returns Array of token balances
 */
export async function getBalances(
  address: string,
  network: string,
): Promise<CDPBalance[]> {
  console.log(`Getting balances for address ${address} on network ${network}`);
  
  // Request path
  const path = `/accounts/${address}/balances`;
  
  // Generate JWT token for authentication
  const jwt = await generateJWT("GET", `${path}?network=${network}`);
  
  const response = await fetch(
    `${CDP_API_URL}${path}?network=${network}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
    },
  );

  if (!response.ok) {
    const responseText = await response.text();
    let error;
    try {
      error = JSON.parse(responseText);
    } catch (e) {
      error = { message: responseText || "Unknown error" };
    }
    console.error(`CDP API error (getBalances): Status ${response.status}`, error);
    throw new Error(
      `Failed to get balances: ${error.message || response.statusText}`,
    );
  }

  const result = await response.json();
  console.log(`Retrieved ${result.balances?.length || 0} balances`);
  
  // Log a sample of the balances for debugging
  if (result.balances && result.balances.length > 0) {
    console.log('Sample balance:', JSON.stringify(result.balances[0], null, 2));
  }
  
  return result.balances || [];
}

/**
 * Format chain name for CDP API
 * @param chain The chain name (e.g., "base", "solana")
 * @returns Formatted network name for CDP API
 */
function formatNetworkName(chain: string): string {
  // Map our internal chain names to CDP network names
  switch (chain.toLowerCase()) {
    case "base":
      return "base-sepolia"; // Using testnet by default
    case "ethereum":
    case "evm":
      return "ethereum-sepolia";
    case "solana":
      return "solana-devnet";
    default:
      return chain;
  }
}

/**
 * Check if a wallet exists in CDP by address
 * @param address The wallet address to check
 * @param network The network to check on
 * @returns Boolean indicating if wallet exists
 */
export async function checkWalletExists(
  address: string,
  network: string
): Promise<boolean> {
  try {
    console.log(`Checking if wallet ${address} exists on ${network}`);
    
    // Request path
    const path = `/accounts/${address}/balances`;
    
    // Generate JWT token for authentication
    const jwt = await generateJWT("GET", `${path}?network=${network}`);
    
    // Try to get balances as a way to verify the wallet exists
    const response = await fetch(
      `${CDP_API_URL}${path}?network=${network}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`,
        },
      },
    );

    // If we get a 404, the wallet doesn't exist
    if (response.status === 404) {
      console.log(`Wallet ${address} does not exist on ${network}`);
      return false;
    }
    
    // If we get a successful response, the wallet exists
    if (response.ok) {
      console.log(`Wallet ${address} exists on ${network}`);
      return true;
    }
    
    // For other errors, log them but assume the wallet might exist
    console.error(`Error checking wallet existence: ${response.status}`);
    return false;
  } catch (error) {
    console.error(`Error in checkWalletExists for ${address}:`, error);
    return false;
  }
}

/**
 * Create or get a wallet for a user
 * @param userId The user ID
 * @param chain The blockchain chain (e.g., "base")
 * @param userName Optional user name to associate with the wallet
 * @returns The wallet information
 */
export async function getOrCreateWallet(
  userId: string,
  chain: string,
  userName?: string,
): Promise<{ id: string, address: string, network: string }> {
  try {
    console.log(
      `Getting or creating wallet for user ${userId} on chain ${chain}${userName ? ` with name "${userName}"` : ''}`,
    );

    // 1. Find or create user in Supabase
    let { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching user:", error);
      // If user not found, we'll create a new one below
    }

    // Format the display name to be user-friendly for pronunciation
    const formatDisplayName = (name: string): string => {
      if (!name) return '';
      
      // If name starts with "User_", replace with a friendly alternative
      if (name.startsWith('User_')) {
        return 'Customer';
      }
      
      // Replace underscores with spaces
      name = name.replace(/_/g, ' ');
      
      // Capitalize first letter of each word
      return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    };

    if (!user) {
      console.log(`Creating new user with ID ${userId}`);
      
      // Use the formatted name or generate a default
      const displayName = userName ? formatDisplayName(userName) : `Customer ${userId.substring(0, 4)}`;
      
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([
          {
            id: userId,
            name: displayName,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (createError) {
        console.error("Error creating user:", createError);
        throw createError;
      }
      user = newUser;
    } else if (userName && user.name !== userName) {
      // Update user name if provided and different
      const displayName = formatDisplayName(userName);
      console.log(`Updating user name from "${user.name}" to "${displayName}"`);
      
      await supabase.from("users").update({ name: displayName }).eq("id", userId);
      user.name = displayName;
    }

    // 2. Check if wallet exists for this user in Supabase
    console.log(`Checking for existing wallet in Supabase for user ${userId} on chain ${chain}`);
    const { data: existingWallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", chain)
      .single();

    if (walletError) {
      console.log(`No existing wallet found in Supabase: ${walletError.message}`);
    }

    if (!walletError && existingWallet) {
      console.log(`Found existing wallet for user ${userId} on chain ${chain}: ${existingWallet.address}`);
      
      // Verify the wallet still exists in CDP
      const network = formatNetworkName(chain);
      console.log(`Verifying wallet ${existingWallet.address} exists in CDP on network ${network}`);
      const walletExists = await checkWalletExists(existingWallet.address, network);
      
      if (walletExists) {
        console.log(`Wallet ${existingWallet.address} verified in CDP`);
        return {
          id: existingWallet.address,
          address: existingWallet.address,
          network: formatNetworkName(chain)
        };
      } else {
        console.log(`Wallet ${existingWallet.address} exists in Supabase but not in CDP. Creating a new one.`);
      }
    }

    // 3. Create a new CDP wallet
    console.log("Creating new CDP wallet");
    const network = formatNetworkName(chain);
    
    try {
      const newWallet = await createWallet(network);
      console.log(`Successfully created new wallet: ${JSON.stringify(newWallet)}`);

      // 4. Store wallet in Supabase
      console.log(`Storing wallet in Supabase for user ${userId}`);
      const { error: insertError } = await supabase.from("wallets").insert({
        user_id: userId,
        chain,
        address: newWallet.address,
        cdp_wallet_id: newWallet.id,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Error storing wallet in Supabase:", insertError);
        
        // Check if this is a duplicate key error (wallet might already exist)
        if (insertError.message.includes('duplicate key')) {
          console.log('Wallet already exists in Supabase, retrieving it');
          const { data: wallet } = await supabase
            .from("wallets")
            .select("*")
            .eq("user_id", userId)
            .eq("chain", chain)
            .single();
            
          if (wallet) {
            return {
              id: wallet.address,
              address: wallet.address,
              network: formatNetworkName(chain)
            };
          }
        }
        
        throw insertError;
      }

      return {
        id: newWallet.address,
        address: newWallet.address,
        network
      };
    } catch (walletError) {
      console.error("Error creating CDP wallet:", walletError);
      
      // If we can't create a wallet, check if we can use a test wallet for development
      if (process.env.NODE_ENV === 'development' && process.env.TEST_WALLET_ADDRESS) {
        console.log(`Using test wallet address for development: ${process.env.TEST_WALLET_ADDRESS}`);
        const testWallet = {
          id: process.env.TEST_WALLET_ADDRESS,
          address: process.env.TEST_WALLET_ADDRESS,
          network
        };
        
        // Store test wallet in Supabase
        try {
          await supabase.from("wallets").insert({
            user_id: userId,
            chain,
            address: testWallet.address,
            cdp_wallet_id: testWallet.id,
            created_at: new Date().toISOString(),
          });
        } catch (e: unknown) {
          console.error("Error storing test wallet:", e instanceof Error ? e.message : String(e));
        }
        
        return testWallet;
      }
      
      throw walletError;
    }
  } catch (error) {
    console.error("Error in getOrCreateWallet:", error);
    throw error;
  }
}

/**
 * Get wallet balance for a user
 * @param userId The user ID
 * @param chain The blockchain chain (e.g., "base")
 * @returns Array of token balances
 */
export async function getUserBalances(
  userId: string,
  chain: string = "base"
): Promise<CDPBalance[]> {
  try {
    console.log(`Getting balances for user ${userId} on chain ${chain}`);
    
    // 1. Get user's wallet
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", chain)
      .single();

    if (error || !wallet) {
      console.error(`No wallet found for user ${userId} on chain ${chain}`);
      return [];
    }

    // 2. Get balances from CDP
    const network = formatNetworkName(chain);
    return await getBalances(wallet.address, network);
  } catch (error) {
    console.error(`Error in getUserBalances for user ${userId} on chain ${chain}:`, error);
    return [];
  }
}

/**
 * Get address details for a user
 * @param userId The user ID
 * @param chain The blockchain chain (e.g., "base")
 * @returns The address details
 */
export async function getUserAddress(
  userId: string,
  chain: string,
): Promise<{ address: string; network: string } | null> {
  try {
    console.log(`Getting address for user ${userId} on chain ${chain}`);
    
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", chain)
      .single();

    if (error) {
      console.error(`Error fetching wallet for user ${userId} on chain ${chain}:`, error);
      return null;
    }

    if (!wallet) {
      console.log(`No wallet found for user ${userId} on chain ${chain}`);
      return null;
    }

    console.log(`Found wallet for user ${userId}: ${wallet.address}`);
    
    return {
      address: wallet.address,
      network: formatNetworkName(chain)
    };
  } catch (error) {
    console.error(`Error in getUserAddress for user ${userId} on chain ${chain}:`, error);
    return null;
  }
}

/**
 * Get transaction history for a wallet address
 * @param address The wallet address
 * @param network The network (e.g., "base-sepolia", "solana-devnet")
 * @returns The transaction history
 */
export async function getTransactionHistory(
  address: string,
  network: string,
): Promise<CDPTransaction[]> {
  console.log(`Getting transaction history for address ${address} on network ${network}`);
  
  // Request path
  const path = `/accounts/${address}/transactions`;
  
  // Generate JWT token for authentication
  const jwt = await generateJWT("GET", `${path}?network=${network}`);
  
  const response = await fetch(
    `${CDP_API_URL}${path}?network=${network}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
    },
  );

  if (!response.ok) {
    const responseText = await response.text();
    let error;
    try {
      error = JSON.parse(responseText);
    } catch (e) {
      error = { message: responseText || "Unknown error" };
    }
    console.error(`CDP API error (getTransactionHistory): Status ${response.status}`, error);
    throw new Error(
      `Failed to get transaction history: ${error.message || response.statusText}`,
    );
  }

  const result = await response.json();
  console.log(`Retrieved ${result.transactions?.length || 0} transactions`);
  return result.transactions || [];
}

/**
 * Get transaction history for a user
 * @param userId The user ID
 * @param chain The blockchain chain (e.g., "base")
 * @returns The transaction history
 */
export async function getUserTransactionHistory(
  userId: string,
  chain: string,
): Promise<CDPTransaction[]> {
  try {
    console.log(`Getting transaction history for user ${userId} on chain ${chain}`);
    
    // 1. Get wallet from Supabase
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", chain)
      .single();

    if (error || !wallet) {
      console.error(`No wallet found for user ${userId} on chain ${chain}`);
      return [];
    }

    // 2. Get transaction history from CDP
    const network = formatNetworkName(chain);
    return await getTransactionHistory(wallet.address, network);
  } catch (error) {
    console.error(`Error in getUserTransactionHistory for user ${userId} on chain ${chain}:`, error);
    return [];
  }
}

/**
 * Send transaction using CDP
 * @param fromAddress The sender address
 * @param toAddress The recipient address
 * @param amount The amount to send
 * @param asset The asset to send (e.g., "ETH", "USDC")
 * @param network The network (e.g., "base-sepolia", "solana-devnet")
 * @returns The transaction hash
 */
export async function sendTransaction(
  fromAddress: string,
  toAddress: string,
  amount: string,
  asset: string = "ETH",
  network: string = "base-sepolia"
): Promise<string> {
  console.log(`Sending ${amount} ${asset} from ${fromAddress} to ${toAddress} on ${network}`);
  
  // Request path and body
  const path = "/transactions/send";
  const body = {
    from: fromAddress,
    to: toAddress,
    amount,
    asset,
    network
  };
  
  // Generate JWT token for authentication
  const jwt = await generateJWT("POST", path, body);
  
  const response = await fetch(`${CDP_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text();
    let error;
    try {
      error = JSON.parse(responseText);
    } catch (e) {
      error = { message: responseText || "Unknown error" };
    }
    console.error(`CDP API error (sendTransaction): Status ${response.status}`, error);
    throw new Error(
      `Failed to send transaction: ${error.message || response.statusText}`,
    );
  }

  const result = await response.json();
  console.log(`Transaction sent with hash: ${result.txHash || result.transactionHash || 'unknown'}`);
  return result.txHash || result.transactionHash || result.hash;
}

/**
 * Get swap quote using CDP
 * @param fromAddress The sender address
 * @param fromAmount The amount to swap
 * @param fromAsset The asset to swap from (e.g., "ETH")
 * @param toAsset The asset to swap to (e.g., "USDC")
 * @param network The network (e.g., "base-sepolia")
 * @returns The swap quote
 */
export async function getSwapQuote(
  fromAddress: string,
  fromAmount: string,
  fromAsset: string,
  toAsset: string,
  network: string = "base-sepolia"
): Promise<any> {
  console.log(`Getting swap quote for ${fromAmount} ${fromAsset} to ${toAsset} on ${network}`);
  
  // Request path and body
  const path = "/swaps/quote";
  const body = {
    from: fromAddress,
    fromAmount,
    fromAsset,
    toAsset,
    network
  };
  
  // Generate JWT token for authentication
  const jwt = await generateJWT("POST", path, body);
  
  const response = await fetch(`${CDP_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text();
    let error;
    try {
      error = JSON.parse(responseText);
    } catch (e) {
      error = { message: responseText || "Unknown error" };
    }
    console.error(`CDP API error (getSwapQuote): Status ${response.status}`, error);
    throw new Error(
      `Failed to get swap quote: ${error.message || response.statusText}`,
    );
  }

  const result = await response.json();
  console.log(`Got swap quote: ${fromAmount} ${fromAsset} → ${result.toAmount} ${toAsset}`);
  return result;
}

/**
 * Execute swap using CDP
 * @param quoteId The quote ID from getSwapQuote
 * @returns The transaction hash
 */
export async function executeSwap(quoteId: string): Promise<string> {
  console.log(`Executing swap with quote ID: ${quoteId}`);
  
  // Request path and body
  const path = "/swaps/execute";
  const body = {
    quoteId
  };
  
  // Generate JWT token for authentication
  const jwt = await generateJWT("POST", path, body);
  
  const response = await fetch(`${CDP_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text();
    let error;
    try {
      error = JSON.parse(responseText);
    } catch (e) {
      error = { message: responseText || "Unknown error" };
    }
    console.error(`CDP API error (executeSwap): Status ${response.status}`, error);
    throw new Error(
      `Failed to execute swap: ${error.message || response.statusText}`,
    );
  }

  const result = await response.json();
  console.log(`Swap executed with hash: ${result.txHash || result.transactionHash || 'unknown'}`);
  return result.txHash || result.transactionHash || result.hash;
}