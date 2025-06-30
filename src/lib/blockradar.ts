import { createClient } from "@supabase/supabase-js";

const BLOCKRADAR_API_URL = "https://api.blockradar.co/v1";
const BLOCKRADAR_API_KEY = process.env.BLOCKRADAR_API_KEY;

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment variables.",
  );
}

if (!BLOCKRADAR_API_KEY) {
  throw new Error(
    "BLOCKRADAR_API_KEY must be set in your environment variables.",
  );
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

interface BlockRadarAddress {
  id: string;
  address: string;
  name?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface BlockRadarBalance {
  asset: {
    asset: {
      address: string;
      blockchain: {
        id: string;
        name: string;
        symbol: string;
        logoUrl: string;
        isEvmCompatible: boolean;
      };
      decimals: number;
      id: string;
      name: string;
      symbol: string;
      logoUrl: string;
    };
    id: string;
  };
  balance: string;
  convertedBalance: string;
}

/**
 * Generate a new wallet address through BlockRadar
 * @param walletId The BlockRadar wallet ID
 * @param name Optional name for the address
 * @param metadata Optional metadata for the address
 * @returns The generated address information
 */
export async function generateAddress(
  walletId: string,
  name?: string,
  metadata?: Record<string, any>,
): Promise<BlockRadarAddress> {
  // BlockRadar API requires a walletId to generate an address
  const response = await fetch(
    `${BLOCKRADAR_API_URL}/wallets/${walletId}/addresses`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": BLOCKRADAR_API_KEY || "",
      },
      body: JSON.stringify({
        name,
        metadata,
        showPrivateKey: false,
        disableAutoSweep: false,
        enableGaslessWithdraw: true,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to generate address: ${error.message || response.statusText}`,
    );
  }

  const result = await response.json();
  return result.data;
}

/**
 * Create a new wallet in BlockRadar
 * @param name Name for the wallet
 * @param metadata Optional metadata for the wallet
 * @returns The created wallet information
 */
export async function createWallet(
  name: string,
  metadata?: Record<string, any>,
) {
  const response = await fetch(`${BLOCKRADAR_API_URL}/wallets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": BLOCKRADAR_API_KEY || "",
    },
    body: JSON.stringify({
      name,
      metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to create wallet: ${error.message || response.statusText}`,
    );
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get address information
 * @param address The address to look up
 * @returns Address information
 */
export async function getAddress(address: string): Promise<BlockRadarAddress> {
  const response = await fetch(`${BLOCKRADAR_API_URL}/addresses/${address}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${BLOCKRADAR_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to get address: ${error.message || response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Get balances for an address
 * @param walletId The BlockRadar wallet ID
 * @param addressId The BlockRadar address ID
 * @returns Array of token balances
 */
export async function getBalances(
  address: string,
): Promise<BlockRadarBalance[]> {
  try {
    // First, get the wallet and address IDs from Supabase
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("address", address)
      .single();

    if (error || !wallet || !wallet.blockradar_id) {
      throw new Error(`Wallet not found for address: ${address}`);
    }

    const walletId = wallet.blockradar_id;
    const addressId = wallet.blockradar_address_id || walletId; // Use address ID if available, fall back to wallet ID

    // Call BlockRadar API to get balances
    const response = await fetch(
      `${BLOCKRADAR_API_URL}/wallets/${walletId}/addresses/${addressId}/balances`,
      {
        method: "GET",
        headers: {
          "x-api-key": BLOCKRADAR_API_KEY || "",
        } as HeadersInit,
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Failed to get balances: ${errorData.message || response.statusText}`,
      );
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error in getBalances:", error);

    // Return empty array instead of throwing to avoid breaking the UI
    return [];
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
) {
  try {
    console.log(
      `Getting or creating wallet for user ${userId} on chain ${chain}`,
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

    if (!user) {
      console.log(`Creating new user with ID ${userId}`);
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([
          {
            id: userId,
            name: userName || `User_${userId.substring(0, 8)}`,
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
      await supabase.from("users").update({ name: userName }).eq("id", userId);

      user.name = userName;
    }

    // 2. Check if wallet exists for this user in Supabase
    const { data: existingWallets, error: walletsError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", chain);

    if (walletsError) {
      console.error("Error fetching wallets:", walletsError);
    }

    // 3. Create a new BlockRadar wallet
    console.log("Creating new BlockRadar wallet");
    const displayName =
      userName || user.name || `User_${userId.substring(0, 8)}`;
    const walletName = `${displayName}'s ${chain.toUpperCase()} Wallet`;

    const newWallet = await createWallet(walletName, {
      userId,
      userName: displayName,
      chain,
    });

    // 4. Generate an address for this wallet
    console.log(`Generating new address for wallet ${newWallet.id}`);
    const newAddress = await generateAddress(
      newWallet.id,
      `${displayName}'s Address`,
      { userId, userName: displayName, chain },
    );

    // 5. If wallet exists, update it; otherwise insert new wallet
    if (existingWallets && existingWallets.length > 0) {
      console.log(
        `Updating existing wallet for user ${userId} on chain ${chain}`,
      );

      const { data: updatedWallet, error: updateError } = await supabase
        .from("wallets")
        .update({
          address: newAddress.address,
          blockradar_id: newWallet.id,
          blockradar_address_id: newAddress.id,
          metadata: {
            wallet: newWallet,
            address: newAddress,
            updated_at: new Date().toISOString(),
          },
        })
        .eq("user_id", userId)
        .eq("chain", chain)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating wallet in Supabase:", updateError);
        throw updateError;
      }

      console.log(`Updated wallet in Supabase:`, updatedWallet);
      return updatedWallet;
    } else {
      // 6. Store new wallet in Supabase
      const { data: newWalletRecord, error: newWalletError } = await supabase
        .from("wallets")
        .insert([
          {
            user_id: userId,
            chain,
            address: newAddress.address,
            blockradar_id: newWallet.id,
            blockradar_address_id: newAddress.id,
            metadata: {
              wallet: newWallet,
              address: newAddress,
              created_at: new Date().toISOString(),
            },
          },
        ])
        .select()
        .single();

      if (newWalletError) {
        console.error("Error storing new wallet in Supabase:", newWalletError);
        throw newWalletError;
      }

      console.log(`Stored new wallet in Supabase:`, newWalletRecord);
      return newWalletRecord;
    }
  } catch (error) {
    console.error("Error in getOrCreateWallet:", error);
    throw error;
  }
}

/**
 * Get wallet balance for a user
 * @param userId The user ID
 * @returns Array of token balances
 */
export async function getUserBalances(
  userId: string,
): Promise<BlockRadarBalance[]> {
  try {
    // 1. Get user's wallet
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !wallet) {
      throw new Error("Wallet not found");
    }

    // 2. Get balances from BlockRadar
    return await getBalances(wallet.address);
  } catch (error) {
    console.error("Error in getUserBalances:", error);
    throw error;
  }
}
