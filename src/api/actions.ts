import { getOrCreatePrivyWallet } from "@/lib/privy";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import { formatAddress, formatBalance } from "@/lib/utils";
import {
  walletTemplates,
  walletCreated,
  swapPending,
  swapSuccessful,
  swapFailed,
  transactionSuccess,
  confirmTransaction,
  txPending,
  bridgeFailed,
  txSentSuccess,
  swapSuccess,
  bridgeSuccess,
  sendFailed,
  walletBalance,
  walletCreatedMulti,
  privateKeys,
  noWalletYet,
  textTemplate,
  usersWalletAddresses,
  cryptoDepositNotification,
  swapProcessing,
  swapQuoteConfirm,
  quotePending,
  swapPrompt,
  sendTokenPrompt,
  bridgeDepositNotification,
  bridgeProcessing,
  bridgeQuoteConfirm,
  bridgeQuotePending,
} from "@/lib/whatsappTemplates";
// import { PrivyClient } from '@privy-io/server-auth'; // Privy EVM support is now disabled
import crypto from "crypto";
import { sendWhatsAppTemplate } from "@/lib/whatsappUtils";
import type { NextApiRequest, NextApiResponse } from "next";
import { formatEther, parseUnits, encodeFunctionData, toHex } from 'viem';
import { handleTransaction } from '../lib/transactionHandler';

// Example: Action handler interface
export type ActionParams = Record<string, any>;

// Define ActionResponse type
interface ActionResponse {
  success: boolean;
  message: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Check if a user has wallets
 * @param userId User ID to check
 * @returns Object with hasWallet flag and wallet data if found
 */
async function checkUserWallets(userId: string) {
  // Check for both EVM and Solana wallets
  const { data: wallets, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error checking user wallets:", error);
    return { hasWallet: false, wallets: null };
  }

  const hasEvm = wallets?.some((w) => w.chain === "evm" || w.chain === "base");
  const hasSolana = wallets?.some((w) => w.chain === "solana");

  return {
    hasWallet: wallets && wallets.length > 0,
    hasEvm,
    hasSolana,
    wallets,
  };
}

/**
 * Verify user has wallets before proceeding with blockchain actions
 * @param userId User ID to check
 * @returns noWalletYet template if no wallet, or null if wallet exists
 */
async function verifyWalletExists(userId: string) {
  try {
    // Check if user has a wallet in BlockRadar
    const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: '', chain: "base" });
    if (!wallet) {
      return noWalletYet();
    }
    return null;
  } catch (error) {
    console.error("Error verifying wallet:", error);
    return noWalletYet();
  }
}

// Function to ask for user's name if not set
async function askForUserName(userId: string): Promise<any> {
  try {
    // Check if user already has a name
    const { data: user } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .single();

    // If user has a proper name (not a generated one), don't ask
    if (user?.name && !user.name.startsWith("User_")) {
      console.log(`User ${userId} already has name: ${user.name}`);
      return null;
    }

    console.log(`Asking user ${userId} for their name`);

    // Store in session that we're waiting for name
    await supabase.from("sessions").upsert(
      [
        {
          user_id: userId,
          context: [
            {
              role: "system",
              content: JSON.stringify({
                waiting_for: "name",
              }),
            },
          ],
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "user_id" },
    );

    // Return a message asking for the name
    return {
      text: "Before we continue, I'd like to personalize your experience. What's your name?",
    };
  } catch (error) {
    console.error("Error in askForUserName:", error);
    return null;
  }
}

// Onboarding handler for first-time and returning users
async function handleOnboarding(userId: string) {
  // Fetch user info
  const { data: user } = await supabase
    .from("users")
    .select("name")
    .eq("id", userId)
    .single();
  const userName = user?.name || `User_${userId.substring(0, 8)}`;

  // Check for wallet
  const { data: wallets } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId);
  const hasWallet = wallets && wallets.length > 0;

  if (!hasWallet) {
    return {
      text: `👋 Hi ${userName}! I'm Hedwig, your crypto assistant. I can help you send, receive, swap, and bridge tokens, and check your balances. Would you like me to create a wallet for you now? (Type 'create wallet' to get started.)`
    };
  } else {
    return {
      text: `👋 Welcome back, ${userName}! What would you like to do today?`
    };
  }
}

export async function handleAction(
  intent: string,
  params: ActionParams,
  userId: string,
) {
  console.log(
    "[handleAction] Intent:",
    intent,
    "Params:",
    params,
    "UserId:",
    userId,
  );

  // Special handling for create_wallets intent from button click
  if (intent === "create_wallets" || intent === "CREATE_WALLET" || 
      params.payload === "create_wallets" || params.payload === "CREATE_WALLET") {
    console.log("[handleAction] Create wallet button clicked or intent detected");
    console.log("[handleAction] Intent value:", intent);
    console.log("[handleAction] Params:", JSON.stringify(params));
    return await handleCreateWallets(userId);
  }

  // Special case for clarification intent
  if (intent === "clarification") {
    return {
      text: "I'm not sure what you're asking. Could you please rephrase your question?",
    };
  }

  // Handle unknown intent
  if (intent === "unknown") {
    console.log("[handleAction] Unknown intent, checking if this is a wallet creation request");
    // Check if this might be a wallet creation request despite unknown intent
    if (params.text && typeof params.text === 'string' && 
        (params.text.toLowerCase().includes('create wallet') || 
         params.text.toLowerCase().includes('wallet create') ||
         params.text.toLowerCase().includes('make wallet') ||
         params.text.toLowerCase().includes('new wallet'))) {
      console.log("[handleAction] Text suggests wallet creation, calling handleCreateWallets");
      return await handleCreateWallets(userId);
    }
    
    return {
      text: "I didn't understand your request. You can ask about creating a wallet, checking balance, sending crypto, swapping tokens, or getting crypto prices.",
    };
  }

  // For blockchain-related intents, verify wallet first
  const blockchainIntents = [
    "get_wallet_balance",
    "get_wallet_address",
    "send",
    "swap",
    "bridge",
    "export_keys",
  ];

  if (blockchainIntents.includes(intent)) {
    try {
      // Check if user has a wallet in Supabase (EVM or Solana)
      const { data: user } = await supabase
        .from("users")
        .select("name")
        .eq("id", userId)
        .single();
      const userName = user?.name || `User_${userId.substring(0, 8)}`;
      const { data: wallets } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId);
      const hasEvm = wallets?.some((w) => w.chain === "evm" || w.chain === "base");
      const hasSolana = wallets?.some((w) => w.chain === "solana");
      if (!hasEvm && !hasSolana) {
        // Block blockchain action and instruct user to create a wallet first
        return {
          text: "You need a wallet before you can continue. Please type 'create wallet' to create your wallet now.",
        };
      }
      // Only proceed with the blockchain action if the user has a wallet
    } catch (error) {
      console.error("Error checking wallet:", error);
      return {
        text: "An error occurred while checking your wallet status. Please try again later.",
      };
    }
  }

  // Handle price and news requests with placeholder responses since we've commented out the actual handlers
  if (intent === "get_price") {
    return {
      text: "Price information is currently unavailable. This feature will be enabled soon.",
    };
  }

  if (intent === "get_news") {
    return {
      text: "News updates are currently unavailable. This feature will be enabled soon.",
    };
  }

  switch (intent) {
    case "welcome":
      return await handleOnboarding(userId);
    case "create_wallets":
      return await handleCreateWallets(userId);
    case "get_wallet_balance":
      return await handleGetWalletBalance(params, userId);
    case "get_wallet_address":
      // Always return the WhatsApp template for wallet address
      return await handleGetWalletAddress(userId);
    case "instruction_deposit":
      // For deposit instructions or wallet address requests, show the wallet address
      return await handleGetWalletAddress(userId);
    case "send":
      return await handleSend(params, userId);
    default:
      return {
        text: "This feature is not supported with Privy wallets."
      };
  }

  // Universal wallet check fallback for any query
  // If the response is not recognized or is a fallback, check for wallet and suggest creation if missing
  try {
    const { data: user } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .single();
    const userName = user?.name || `User_${userId.substring(0, 8)}`;
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId);
    const hasEvm = wallets?.some((w) => w.chain === "evm" || w.chain === "base");
    const hasSolana = wallets?.some((w) => w.chain === "solana");
    if (!hasEvm && !hasSolana) {
      return {
        text: `Hi ${userName}, you don't have a wallet yet. Would you like to create one?`,
        ...noWalletYet(),
      };
    }
  } catch (error) {
    // If Supabase fails, just return a generic fallback
    return {
      text: "Sorry, I couldn't check your wallet status. Please try again later.",
    };
  }
}

// Handler for creating a new wallet
async function handleCreateWallets(userId: string) {
  try {
    console.log(`[handleCreateWallets] Creating wallet for user ${userId}`);

    // Fetch user name
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("name, phone_number")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error(`[handleCreateWallets] Error fetching user: ${userError.message}`);
    }

    const userName = userData?.name || `User_${userId.substring(0, 8)}`;
    console.log(`[handleCreateWallets] User name: ${userName}`);
    
    // Check if wallet already exists to prevent duplicates
    const { data: existingWallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", "base")
      .maybeSingle();
      
    if (walletError) {
      console.error(`[handleCreateWallets] Error checking existing wallet: ${walletError.message}`);
    }
      
    if (existingWallet) {
      console.log(`[handleCreateWallets] Wallet already exists: ${existingWallet.address}`);
      return {
        text: `You already have a wallet, ${userName}!` ,
        ...walletCreatedMulti({ evm_wallet: existingWallet.address })
      };
    }

    // Use Privy to create or get wallet
    const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: userData?.phone_number, chain: "base", name: userName });
    
    console.log(`[handleCreateWallets] Successfully created wallet: ${wallet.address}`);
    const response = walletCreatedMulti({ evm_wallet: wallet.address });
    console.log(`[handleCreateWallets] Response: ${JSON.stringify(response)}`);
    
    return {
      text: `Wallet created for ${userName}!` ,
      ...response
    };
  } catch (error) {
    console.error("[handleCreateWallets] Error:", error);
    return { text: "Error creating wallet. Please try again later." };
  }
}

// Handler for getting wallet address
async function handleGetWalletAddress(userId: string) {
  try {
    // Get user info from Supabase for name
    const { data: user } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .single();

    const userName = user?.name || `User_${userId.substring(0, 8)}`;

    // Get wallet using CDP
    const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: '', chain: "base" });

    if (!wallet || !wallet.address) {
      console.error("Failed to get wallet");
      return { text: "Error fetching wallet address. Please try again." };
    }

    console.log("Retrieved wallet address:", {
      address: wallet.address,
      network: "base", // Use hardcoded value instead of wallet.chain
      userName: userName,
    });

    // Return wallet address
    return usersWalletAddresses({
      evm_wallet: wallet.address,
    });
  } catch (error) {
    console.error("Error in handleGetWalletAddress:", error);
    return {
      text: "Failed to retrieve wallet address. Please try again later.",
    };
  }
}

/**
 * Handle wallet balance action - Fetch real wallet balances using CDP Wallet History API
 * @param params Action parameters
 * @param userId User ID
 * @returns Response with wallet balance template
 */
async function handleGetWalletBalance(params: ActionParams, userId: string) {
  try {
    console.log(`[handleGetWalletBalance] Fetching balance for user ${userId}`);
    
    // Get the user's wallet from Supabase
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", "base")
      .single();
    
    if (error) {
      console.error("[handleGetWalletBalance] Error fetching wallet:", error);
      return { text: "Failed to retrieve your wallet address. Please try again later." };
    }
    
    if (!wallet?.address) {
      console.log("[handleGetWalletBalance] No wallet found for user");
      return { text: "You don't have a wallet yet. Type 'create wallet' to create one." };
    }
    
    const walletAddress = wallet.address;
    console.log(`[handleGetWalletBalance] Found wallet: ${walletAddress}`);
    
    // Initialize default balances in case API calls fail
    let ethBalance = "0";
    let usdcBalance = "0";
    let cngnBalance = "0";
    
    try {
      // Call CDP Wallet History API to fetch wallet balances
      // Based on docs from https://docs.cdp.coinbase.com/data/wallet-history/overview
      const apiKey = process.env.CDP_API_KEY;
      const baseUrl = process.env.CDP_API_URL || 'https://api.coinbase.com/api/v3/bware';
      
      if (!apiKey) {
        throw new Error('CDP_API_KEY not configured');
      }
      
      // Fetch ETH balance
      console.log(`[handleGetWalletBalance] Fetching ETH balance for ${walletAddress}`);
      const ethResponse = await fetch(`${baseUrl}/wallets/address/${walletAddress}/balances?network=base-sepolia`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (ethResponse.ok) {
        const ethData = await ethResponse.json();
        const ethAsset = ethData.balances?.find((asset: any) => 
          asset.symbol?.toLowerCase() === 'eth' || asset.contractAddress === '0x0000000000000000000000000000000000000000'
        );
        
        if (ethAsset) {
          ethBalance = formatBalance(ethAsset.balance || "0", 18);
          console.log(`[handleGetWalletBalance] ETH balance: ${ethBalance}`);
        }
      } else {
        console.error("[handleGetWalletBalance] Error fetching ETH balance:", 
          await ethResponse.text());
      }
      
      // Fetch USDC balance - USDC on Base contract address
      const usdcContractAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Base USDC
      console.log(`[handleGetWalletBalance] Fetching USDC balance for ${walletAddress}`);
      const usdcResponse = await fetch(`${baseUrl}/wallets/address/${walletAddress}/balances?network=base-sepolia&contract_address=${usdcContractAddress}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (usdcResponse.ok) {
        const usdcData = await usdcResponse.json();
        const usdcAsset = usdcData.balances?.find((asset: any) => 
          asset.symbol?.toLowerCase() === 'usdc'
        );
        
        if (usdcAsset) {
          usdcBalance = formatBalance(usdcAsset.balance || "0", 6);
          console.log(`[handleGetWalletBalance] USDC balance: ${usdcBalance}`);
        }
      } else {
        console.error("[handleGetWalletBalance] Error fetching USDC balance:", 
          await usdcResponse.text());
      }
      
      // Fetch cNGN balance - Placeholder for now, assuming contract address
      const cngnContractAddress = "0x6f18708187959b7a371b3a335e75d94ee4b07c4e"; // Placeholder for cNGN address
      console.log(`[handleGetWalletBalance] Fetching cNGN balance for ${walletAddress}`);
      const cngnResponse = await fetch(`${baseUrl}/wallets/address/${walletAddress}/balances?network=base-sepolia&contract_address=${cngnContractAddress}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (cngnResponse.ok) {
        const cngnData = await cngnResponse.json();
        const cngnAsset = cngnData.balances?.find((asset: any) => 
          asset.symbol?.toLowerCase() === 'cngn'
        );
        
        if (cngnAsset) {
          cngnBalance = formatBalance(cngnAsset.balance || "0", 18);
          console.log(`[handleGetWalletBalance] cNGN balance: ${cngnBalance}`);
        }
      } else {
        console.error("[handleGetWalletBalance] Error fetching cNGN balance:", 
          await cngnResponse.text());
      }
    } catch (apiError) {
      console.error("[handleGetWalletBalance] Error calling CDP API:", apiError);
      // Continue with defaults if API call fails
    }
    
    // Return the wallet balance template with actual balances
    console.log("[handleGetWalletBalance] Returning balances:", {
      eth_balance: ethBalance,
      usdc_base_balance: usdcBalance,
      cngn_balance: cngnBalance
    });
    
    return walletBalance({
      eth_balance: ethBalance || "0",
      usdc_base_balance: usdcBalance || "0",
      cngn_balance: cngnBalance || "0",
    });
  } catch (error) {
    console.error("[handleGetWalletBalance] Error:", error);
    return {
      text: 'Sorry, I could not retrieve your wallet balance at this time.',
    };
  }
}

// Handler for swapping tokens using CDP
async function handleSwapTokens(params: ActionParams, userId: string) {
  return { text: 'Swapping tokens is not supported with Privy wallets.' };
}

/*
async function handleGetPrice(params: ActionParams, userId: string) {
  try {
    const token = (params.token || 'ethereum').toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`);
    if (!res.ok) {
      return { text: 'Failed to fetch price.' };
    }
    const data = await res.json();
    const price = data[token]?.usd;
    if (!price) {
      return { text: `No price for ${token}` };
    }
    return { text: `${token.toUpperCase()}: $${price}` };
  } catch (error) {
    return { text: 'Failed to get price.' };
  }
}

async function handleGetNews(params: ActionParams, userId: string) {
  try {
    // You need to set your CryptoPanic API key in .env as CRYPTOPANIC_API_KEY
    const apiKey = process.env.CRYPTOPANIC_API_KEY;
    const res = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&public=true`);
    if (!res.ok) {
      return { text: 'Failed to fetch news.' };
    }
    const data = await res.json();
    const news = data.results?.slice(0, 3).map((n: any) => `• ${n.title}`).join('\n');
    return { text: news || 'No news.' };
  } catch (error) {
    return { text: 'Failed to get news.' };
  }
}
*/

function getExplorerUrl(chain: string, txHash: string): string {
  switch (chain) {
    case "evm":
    case "base":
    case "base-mainnet":
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case "solana":
    case "solana-mainnet":
      return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
    default:
      return "";
  }
}

// Transaction status tracking utility
async function updateTransactionStatus(txHash: string, status: string) {
  await supabase.from("transactions").update({ status }).eq("tx_hash", txHash);
}

/**
 * Send a transaction via CDP API
 * @param address Wallet address to send from
 * @param recipient Recipient address
 * @param amount Amount to send in ETH (will be converted to wei)
 * @param network Network to use (e.g. 'base-sepolia')
 * @returns Transaction hash
 */
async function sendCDPTransaction({
  address,
  recipient,
  amount,
  network = 'base-sepolia',
}: {
  address: string;
  recipient: string;
  amount: string;
  network?: string;
}): Promise<string> {
  console.log(`[sendCDPTransaction] Sending ${amount} ETH to ${recipient} from ${address} on ${network}`);
  
  try {
    const apiKey = process.env.CDP_API_KEY;
    const walletSecret = process.env.CDP_WALLET_SECRET;
    const baseUrl = process.env.CDP_API_URL || 'https://api.cdp.coinbase.com';
    
    if (!apiKey || !walletSecret) {
      throw new Error('CDP_API_KEY or CDP_WALLET_SECRET not configured');
    }

    // Calculate value in wei
    const valueInWei = parseUnits(amount, 18).toString();
    console.log(`[sendCDPTransaction] Amount in wei: ${valueInWei}`);

    // Create transaction object as a hex string
    // Since viem doesn't export serialize directly, we'll create a simple hex transaction
    const txData = {
      to: recipient,
      value: toHex(valueInWei),
      data: '0x', // No contract interaction, just a simple ETH transfer
    };

    // Generate the wallet authorization token
    const walletToken = generateWalletAuthToken(walletSecret, address);
    
    // Set up the API request
    const response = await fetch(
      `${baseUrl}/platform/v2/evm/accounts/${address}/send/transaction`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Wallet-Auth': walletToken,
        },
        body: JSON.stringify({
          network,
          transaction: txData // CDP API can accept transaction parameters directly
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sendCDPTransaction] Error: ${response.status} ${errorText}`);
      throw new Error(`CDP API error: ${errorText}`);
    }

    const data = await response.json();
    console.log(`[sendCDPTransaction] Transaction sent: ${data.transactionHash}`);
    
    return data.transactionHash;
  } catch (error) {
    console.error('[sendCDPTransaction] Error:', error);
    throw error;
  }
}

/**
 * Generate a wallet authorization token for CDP API
 * @param walletSecret Wallet secret from CDP
 * @param address Wallet address
 * @returns Signed JWT token
 */
function generateWalletAuthToken(walletSecret: string, address: string): string {
  // The payload structure as required by CDP
  const payload = {
    sub: address.toLowerCase(), // Subject is the wallet address (lowercase)
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes expiration
    iat: Math.floor(Date.now() / 1000), // Issued at current time
    scope: 'write:transactions',  // Scope for sending transactions
  };
  
  // Convert payload to base64url encoding (JWT format)
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
    
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  // Create the signature
  const signature = crypto
    .createHmac('sha256', walletSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  // Return the complete JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Multi-step send flow support - now uses Privy
async function handleSend(params: ActionParams, userId: string) {
  try {
    console.log(`[handleSend] Processing send request for user ${userId}:`, params);
    const isExecute = params.isExecute === true;
    const token = params.token || 'ETH';
    const amount = params.amount || '';
    const recipient = params.recipient || '';
    const network = params.network || 'base';
    if (!amount || !recipient) {
      return { text: 'Missing required parameters for sending. Please specify amount and recipient.' };
    }
    if (token.toLowerCase() !== 'eth') {
      return { text: 'Currently only ETH transfers are supported. Please try again with ETH.' };
    }
    if (!isExecute) {
      // Return a formatted message for confirmation
      return sendTokenPrompt({
        amount: amount,
        token: token,
        recipient: formatAddress(recipient),
        network: network,
        fee: '~0.0001 ETH',
        estimatedTime: '30-60 seconds',
      });
    }
    // Show tx_pending template before sending
    // (This will be sent by the WhatsApp handler before calling handleSend)
    try {
      // Execute the transaction using Privy
      const txResult = await handleTransaction(userId, params, { ...params, isExecute: true });
      // Return success message with transaction details
      return txSentSuccess({
        amount: amount,
        token: token,
        recipient: formatAddress(recipient),
        explorerUrl: (txResult && typeof txResult === 'object' && 'explorerUrl' in txResult) ? txResult.explorerUrl : '',
      });
    } catch (sendError: any) {
      console.error(`[handleSend] Error sending transaction:`, sendError);
      return sendFailed({
        reason: sendError.message || 'Error sending transaction. Please try again later.',
      });
    }
  } catch (error) {
    console.error(`[handleSend] Error:`, error);
    return { text: 'An unexpected error occurred. Please try again later.' };
  }
}

async function handleExportKeys(params: ActionParams, userId: string) {
  // ... logic to generate privy link ...
  return privateKeys({ privy_link: "https://privy.io/privatekeys" });
}

// Example handler for bridging
async function handleBridge(params: ActionParams, userId: string) {
  return { text: 'Bridging tokens is not supported with Privy wallets.' };
}

// Handler for crypto deposit notification
async function handleCryptoDeposit(params: ActionParams, userId: string) {
  try {
    console.log(`Notifying user ${userId} about crypto deposit`);

    // Check if we have all required parameters
    const amount = params.amount || "0";
    const token = params.token || "USDC";
    const network = params.network || "Base Sepolia";
    const from = params.from || "-";
    const txUrl = params.txUrl || "-";

    // Get user's current balance
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", network.toLowerCase() === "solana" ? "solana" : "evm")
      .single();

    if (error) {
      console.error("Error fetching wallet for deposit notification:", error);
    }

    // TODO: Implement real balance fetching from blockchain
    // For now use placeholder or provided balance
    const balance = params.balance || `${Number(amount) + 50} ${token}`;

    return cryptoDepositNotification({
      amount,
      token,
      from,
      network,
      balance,
      txUrl,
    });
  } catch (error) {
    console.error("Error handling crypto deposit notification:", error);
    return { text: "Failed to process deposit notification." };
  }
}

// Handler for swap quote
async function handleSwapQuote(params: ActionParams, userId: string) {
  try {
    console.log(`Getting swap quote for user ${userId}`);

    // First show pending message
    await supabase.from("messages").insert([
      {
        user_id: userId,
        content: JSON.stringify(quotePending()),
        role: "assistant",
        created_at: new Date().toISOString(),
      },
    ]);

    // Get swap parameters
    const fromToken = params.from_token || params.fromToken || "ETH";
    const toToken = params.to_token || params.toToken || "USDC";
    const amount = params.amount || "0.01";
    const chain = params.chain || params.network || "Base Sepolia";

    // Simulate getting a quote (in a real app, you'd call a DEX API)
    // This is a placeholder for demonstration purposes
    const fromAmount = `${amount} ${fromToken}`;
    const rate =
      fromToken === "ETH" ? "2000" : fromToken === "SOL" ? "150" : "1";
    const toAmount = `${Number(amount) * Number(rate)} ${toToken}`;
    const networkFee =
      chain.toLowerCase() === "solana" ? "0.00001 SOL" : "0.0003 ETH";
    const estTime = "1-3 mins";

    return swapQuoteConfirm({
      from_amount: fromAmount,
      to_amount: toAmount,
      chain,
      rate: `1 ${fromToken} = $${rate}`,
      network_fee: networkFee,
      est_time: estTime,
    });
  } catch (error) {
    console.error("Error getting swap quote:", error);
    return { text: "Failed to get swap quote." };
  }
}

// Handler for initiating a swap
async function handleSwapInit(params: ActionParams, userId: string) {
  try {
    console.log(`Initiating swap for user ${userId}`);

    // Get swap parameters
    const fromToken = params.from_token || params.fromToken || "ETH";
    const toToken = params.to_token || params.toToken || "USDC";
    const amount = params.amount || "0.01";
    const network = params.network || params.chain || "Base Sepolia";

    return swapPrompt({
      amount,
      from_token: fromToken,
      to_token: toToken,
      network,
    });
  } catch (error) {
    console.error("Error initiating swap:", error);
    return { text: "Failed to initiate swap." };
  }
}

// Handler for processing a swap
async function handleSwapProcess(params: ActionParams, userId: string) {
  try {
    console.log(`Processing swap for user ${userId}`);

    // First show the processing message
    await supabase.from("messages").insert([
      {
        user_id: userId,
        content: JSON.stringify(swapProcessing()),
        role: "assistant",
        created_at: new Date().toISOString(),
      },
    ]);

    // In a real app, you would submit the swap to a DEX and wait for confirmation
    // This is a placeholder that simulates a successful swap after a delay

    // For demonstration, we'll return the success message directly
    // In a real app, you would set up a webhook or polling mechanism
    const fromToken = params.from_token || params.fromToken || "ETH";
    const toToken = params.to_token || params.toToken || "USDC";
    const amount = params.amount || "0.01";
    const network = params.network || params.chain || "Base Sepolia";

    const rate =
      fromToken === "ETH" ? "2000" : fromToken === "SOL" ? "150" : "1";
    const toAmount = `${Number(amount) * Number(rate)} ${toToken}`;

    return swapSuccess({
      from_amount: `${amount} ${fromToken}`,
      to_amount: toAmount,
      network,
      balance: `${toAmount}`,
      explorerUrl: "https://sepolia.basescan.org/tx/0x", // Testnet explorer URL
    });
  } catch (error) {
    console.error("Error processing swap:", error);
    return { text: "Failed to process swap." };
  }
}

// Handler for initiating a token send
async function handleSendInit(params: ActionParams, userId: string) {
  try {
    console.log(`Initiating send for user ${userId}`);

    // Get send parameters
    const token = params.token || "ETH";
    const amount = params.amount || "0.01";
    const recipient = params.recipient || params.to || "0x...";
    const network = params.network || params.chain || "Base Sepolia";
    const fee = params.fee || (token === "SOL" ? "0.000005 SOL" : "0.0001 ETH");
    const estimatedTime = params.estimatedTime || "1-5 mins";
    // Return the interactive message with confirm/cancel buttons
    return sendTokenPrompt({
      amount,
      token,
      recipient,
      network,
      fee,
      estimatedTime,
    });
  } catch (error) {
    console.error("Error initiating send:", error);
    return { text: "Failed to initiate send." };
  }
}

// Handler for bridge deposit notification
async function handleBridgeDeposit(params: ActionParams, userId: string) {
  try {
    console.log(`Notifying user ${userId} about bridge deposit`);

    // Check if we have all required parameters
    const amount = params.amount || "0";
    const token = params.token || "ETH";
    const network = params.network || "Base Sepolia";

    // Get user's current balance
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", network.toLowerCase() === "solana" ? "solana" : "evm")
      .single();

    if (error) {
      console.error(
        "Error fetching wallet for bridge deposit notification:",
        error,
      );
    }

    // TODO: Implement real balance fetching from blockchain
    // For now use placeholder or provided balance
    const balance = params.balance || `${Number(amount) + 50} ${token}`;

    return bridgeDepositNotification({
      amount,
      token,
      network,
      balance,
    });
  } catch (error) {
    console.error("Error handling bridge deposit notification:", error);
    return { text: "Failed to process bridge deposit notification." };
  }
}

// Handler for bridge quote
async function handleBridgeQuote(params: ActionParams, userId: string) {
  try {
    console.log(`Getting bridge quote for user ${userId}`);

    // First show pending message
    await supabase.from("messages").insert([
      {
        user_id: userId,
        content: JSON.stringify(bridgeQuotePending()),
        role: "assistant",
        created_at: new Date().toISOString(),
      },
    ]);

    // Get bridge parameters
    const fromAmount = params.from_amount || params.fromAmount || "0.01 ETH";
    const toAmount = params.to_amount || params.toAmount || "0.01 ETH";
    const fromChain = params.from_chain || params.fromChain || "Base Sepolia";
    const toChain = params.to_chain || params.toChain || "Solana Devnet";
    const fee = params.fee || "0.0001 ETH";
    const estTime = params.est_time || params.estTime || "5-10 mins";

    return bridgeQuoteConfirm({
      from_amount: fromAmount,
      to_amount: toAmount,
      from_chain: fromChain,
      to_chain: toChain,
      fee,
      est_time: estTime,
    });
  } catch (error) {
    console.error("Error getting bridge quote:", error);
    return { text: "Failed to get bridge quote." };
  }
}

// Handler for initiating a bridge
async function handleBridgeInit(params: ActionParams, userId: string) {
  try {
    console.log(`Initiating bridge for user ${userId}`);

    // Get bridge parameters
    const fromAmount = params.from_amount || params.fromAmount || "0.01 ETH";
    const toAmount = params.to_amount || params.toAmount || "0.01 ETH";
    const fromChain = params.from_chain || params.fromChain || "Base Sepolia";
    const toChain = params.to_chain || params.toChain || "Solana Devnet";

    // First show the bridge processing message
    await supabase.from("messages").insert([
      {
        user_id: userId,
        content: JSON.stringify(bridgeProcessing()),
        role: "assistant",
        created_at: new Date().toISOString(),
      },
    ]);

    // In a real app, you would submit the bridge transaction and wait for confirmation
    // This is a placeholder that simulates a successful bridge after a delay

    // Extract the token and amount from the parameters
    const [amountValue, tokenSymbol] = fromAmount.split(" ");
    const token = tokenSymbol || "ETH";

    // For demonstration, show the bridge deposit notification instead of bridge success
    // This simulates receiving tokens on the destination chain
    return bridgeDepositNotification({
      amount: amountValue,
      token: token,
      network: toChain,
      balance: toAmount,
    });
  } catch (error) {
    console.error("Error initiating bridge:", error);
    return { text: "Failed to initiate bridge." };
  }
}

// Add a handler for crypto deposits (when tokens are received)
async function handleCryptoReceived(params: ActionParams, userId: string) {
  try {
    console.log(`Notifying user ${userId} about crypto deposit`);

    // Check if we have all required parameters
    const amount = params.amount || "0";
    const token = params.token || "USDC";
    const network = params.network || "Base Sepolia";
    const from = params.from || "-";
    const txUrl = params.txUrl || "-";

    // Get user's current balance
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", network.toLowerCase() === "solana" ? "solana" : "evm")
      .single();

    if (error) {
      console.error(
        "Error fetching wallet for crypto deposit notification:",
        error,
      );
    }

    // TODO: Implement real balance fetching from blockchain
    // For now use placeholder or provided balance
    const balance = params.balance || `${Number(amount) + 50} ${token}`;

    // Send a crypto deposit notification
    return cryptoDepositNotification({
      amount,
      token,
      from,
      network,
      balance,
      txUrl,
    });
  } catch (error) {
    console.error("Error handling crypto deposit notification:", error);
    return { text: "Failed to process deposit notification." };
  }
}

// Handler for providing swap instructions
function handleSwapInstructions() {
  return {
    text: `💱 *How to Swap Tokens*\n\nTo swap tokens, simply type a message like:\n\n"Swap 0.001 SOL to USDC on Solana"\n\nor\n\n"Swap 0.01 ETH to USDC on Base"\n\nI'll then search for the best quote and show you the details for confirmation.`,
  };
}

// Handler for providing bridge instructions
function handleBridgeInstructions() {
  return {
    text: `🌉 *How to Bridge Tokens*\n\nTo bridge tokens between chains, simply type a message like:\n\n"Bridge 0.001 SOL on Solana to ETH on Base"\n\nor\n\n"Bridge 0.01 ETH on Base to Solana"\n\nI'll then search for the best route and show you the details for confirmation.`,
  };
}

// Handler for providing deposit instructions
async function handleDepositInstructions(userId: string) {
  try {
    // Get wallet addresses to show the user where to deposit
    const { data: evmWallet, error: evmError } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", "evm")
      .single();

    if (evmError) {
      console.error("Error fetching EVM wallet:", evmError);
    }

    const { data: solanaWallet, error: solanaError } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", "solana")
      .single();

    if (solanaError) {
      console.error("Error fetching Solana wallet:", solanaError);
    }

    // If the user doesn't have wallets yet, prompt them to create wallets
    if (
      (!evmWallet || !solanaWallet) &&
      !evmWallet?.address &&
      !solanaWallet?.address
    ) {
      return {
        text: `💼 *Deposit Instructions*\n\nBefore you can deposit funds, you need to create a wallet first. Type "create wallet" to get started.`,
      };
    }

    // Return wallet addresses as deposit instructions
    return {
      text: `📥 *How to Deposit Funds*\n\nYou can deposit funds to your wallets using these addresses:\n\n*EVM Wallet (Base, Ethereum):*\n\`${evmWallet?.address || "Not created yet"}\`\n\n*Solana Wallet:*\n\`${solanaWallet?.address || "Not created yet"}\`\n\nOnce your deposit is confirmed on the blockchain, I'll send you a notification.`,
    };
  } catch (error) {
    console.error("Error in handleDepositInstructions:", error);
    return { text: "Failed to get deposit instructions. Please try again." };
  }
}

// Handler for providing send/withdraw instructions
function handleSendInstructions() {
  return {
    text: `📤 *How to Send or Withdraw Tokens*\n\nTo send tokens to another wallet, simply type a message like:\n\n"Send 0.001 ETH to 0x1234...5678 on Base"\n\nor\n\n"Send 0.1 SOL to address 8rUW...ZjqP on Solana"\n\nI'll then show you a confirmation with the details before proceeding.`,
  };
}

// Helper to sanitize WhatsApp template parameters
function sanitizeWhatsAppParam(text: string): string {
  return text.replace(/[\n\t]/g, " ").replace(/ {5,}/g, "    ");
}

// Patch sendSuccess, sendFailed, sendTokenPrompt, etc. to sanitize parameters before sending
// Example for sendSuccess:
function sendSuccessSanitized(args: any) {
  return txSentSuccess({
    ...args,
    amount: sanitizeWhatsAppParam(args.amount),
    token: sanitizeWhatsAppParam(args.token),
    recipient: sanitizeWhatsAppParam(args.recipient),
    explorerUrl: sanitizeWhatsAppParam(args.explorerUrl),
  });
}

function cdpSign({
  secret,
  timestamp,
  method,
  requestPath,
  body,
}: {
  secret: string;
  timestamp: string;
  method: string;
  requestPath: string;
  body: string;
}): string {
  const prehash = timestamp + method.toUpperCase() + requestPath + body;
  return crypto.createHmac("sha256", secret).update(prehash).digest("hex");
}

// Helper function to format network names for CDP API
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

// --- Alchemy Webhook Handler for Deposit Notifications ---
// This should be added to your API routes (e.g., /api/webhooks/alchemy)
export async function handleAlchemyWebhook(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    console.log(
      "[Alchemy Webhook] Handler called:",
      JSON.stringify(req.body, null, 2),
    );
    const event = req.body;
    const activities = event.event?.activity || [];
    console.log("[Alchemy Webhook] Activities:", activities);
    for (const activity of activities) {
      if (
        (activity.category === "token_transfer" ||
          activity.category === "external") &&
        activity.toAddress
      ) {
        const toAddress = activity.toAddress.toLowerCase();
        console.log(
          "[Alchemy Webhook] Looking up wallet for address:",
          toAddress,
        );
        const { data: wallet } = await supabase
          .from("wallets")
          .select("user_id, chain, privy_wallet_id")
          .eq("address", toAddress)
          .single();
        console.log("[Alchemy Webhook] Wallet lookup result:", wallet);
        if (!wallet) {
          const { data: allWallets } = await supabase
            .from("wallets")
            .select("address");
          console.log(
            "[Alchemy Webhook] No wallet found. All wallet addresses in DB:",
            allWallets,
          );
          continue;
        }
        const { data: user } = await supabase
          .from("users")
          .select("phone_number")
          .eq("id", wallet.user_id)
          .single();
        console.log("[Alchemy Webhook] User lookup result:", user);
        if (!user) {
          console.log("[Alchemy Webhook] No user found for wallet:", toAddress);
          continue;
        }
        const amount = activity.value ? Number(activity.value).toFixed(6) : "0";
        const token = activity.asset || "ETH";
        const from = activity.fromAddress || "-";
        const network =
          wallet.chain === "solana" ? "Solana Devnet" : "Base Sepolia";
        let balance = amount + " " + token;
        let newBalance = "0";
        let lastBalance = "0";
        // Instead of calling getBaseSepoliaEthBalance or getSolanaSolBalanceDirect, just use the amount
        newBalance = amount;
        balance = newBalance + " " + token;
        // Fetch last known balance from sessions
        const { data: session } = await supabase
          .from("sessions")
          .select("context")
          .eq("user_id", wallet.user_id)
          .single();
        let last = null;
        if (session?.context) {
          last = session.context.find(
            (item: any) =>
              item.role === "system" && JSON.parse(item.content)?.lastBalances,
          );
        }
        let lastBalances = last ? JSON.parse(last.content).lastBalances : {};
        if (wallet.chain === "evm") {
          lastBalance = lastBalances.eth || "0";
        } else if (wallet.chain === "solana") {
          lastBalance = lastBalances.sol || "0";
        }
        console.log(
          "[Alchemy Webhook] New balance:",
          newBalance,
          "Previous:",
          lastBalance,
        );
        // Only send template if balance changed
        if (newBalance !== lastBalance) {
          const txHash = activity.hash || "";
          const txUrl = txHash
            ? wallet.chain === "solana"
              ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
              : `https://basescan.org/tx/${txHash}`
            : "-";
          const templateParams = {
            amount,
            token,
            from,
            network,
            balance,
            txUrl,
          };
          console.log("[Alchemy Webhook] Sending WhatsApp template:", {
            phone: user.phone_number,
            params: templateParams,
          });
          try {
            const result = await sendWhatsAppTemplate(
              user.phone_number,
              cryptoDepositNotification(templateParams),
            );
            console.log("[Alchemy Webhook] WhatsApp API result:", result);
          } catch (err) {
            console.error("[Alchemy Webhook] WhatsApp send error:", err);
          }
          console.log(
            `[Alchemy Webhook] Notified user ${user.phone_number} of deposit to ${toAddress}`,
          );
        } else {
          console.log(
            "[Alchemy Webhook] Balance unchanged, not sending template.",
          );
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[Alchemy Webhook] Error:", err);
    res.status(500).json({ error: "Webhook handler error" });
  }
}
