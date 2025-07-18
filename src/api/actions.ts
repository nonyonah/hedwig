import { getOrCreateCdpWallet, createWallet, getTransaction, getBalances, transferNativeToken, transferToken, estimateTransactionFee } from "@/lib/cdp";
import { createClient } from "@supabase/supabase-js";

import fetch from "node-fetch";
import { formatUnits } from "viem";
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
  exportWallet,
  noWalletYet,
  createNewWallet,
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
import { analyzeTokenPrice, formatPriceResponse } from "@/lib/tokenPriceService";
// import { PrivyClient } from '@privy-io/server-auth'; // Privy EVM support is now disabled
import crypto from "crypto";
import { sendWhatsAppTemplate } from "@/lib/whatsappUtils";
import type { NextApiRequest, NextApiResponse } from "next";
import { formatEther, parseUnits, encodeFunctionData, toHex } from 'viem';

// Import CDP signing function
function cdpSign({
  secret,
  timestamp,
  method,
  requestPath,
  body = '',
}: {
  secret: string;
  timestamp: string;
  method: string;
  requestPath: string;
  body?: string;
}) {
  const message = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

// ===== CDP TRANSACTION FUNCTIONS =====

/**
 * Send EVM transaction using CDP API
 * @param walletId CDP wallet ID
 * @param networkId Network ID (e.g., 'base-sepolia', 'ethereum-sepolia')
 * @param to Recipient address
 * @param value Amount in wei (as string)
 * @param data Optional transaction data (for contract calls)
 * @returns Transaction result
 */
export async function sendEvmTransaction({
  walletId,
  networkId,
  to,
  value,
  data = '0x',
}: {
  walletId: string;
  networkId: string;
  to: string;
  value: string;
  data?: string;
}) {
  try {
    console.log(`[sendEvmTransaction] Sending EVM transaction:`, {
      walletId,
      networkId,
      to,
      value,
      data,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const requestPath = `/platform/v2/wallets/${walletId}/accounts/${networkId}/transactions`;
    const body = JSON.stringify({
      to,
      value,
      data,
    });

    const signature = cdpSign({
      secret: process.env.CDP_API_KEY_SECRET!,
      timestamp,
      method,
      requestPath,
      body,
    });

    const response = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CB-ACCESS-KEY': process.env.CDP_API_KEY_ID!,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sendEvmTransaction] CDP API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`CDP API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[sendEvmTransaction] Transaction sent successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[sendEvmTransaction] Error:`, error);
    throw error;
  }
}

/**
 * Sign EVM transaction using CDP API
 * @param walletId CDP wallet ID
 * @param networkId Network ID
 * @param to Recipient address
 * @param value Amount in wei
 * @param data Transaction data
 * @returns Signed transaction
 */
export async function signEvmTransaction({
  walletId,
  networkId,
  to,
  value,
  data = '0x',
}: {
  walletId: string;
  networkId: string;
  to: string;
  value: string;
  data?: string;
}) {
  try {
    console.log(`[signEvmTransaction] Signing EVM transaction:`, {
      walletId,
      networkId,
      to,
      value,
      data,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const requestPath = `/platform/v2/wallets/${walletId}/accounts/${networkId}/sign-transaction`;
    const body = JSON.stringify({
      to,
      value,
      data,
    });

    const signature = cdpSign({
      secret: process.env.CDP_API_KEY_SECRET!,
      timestamp,
      method,
      requestPath,
      body,
    });

    const response = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CB-ACCESS-KEY': process.env.CDP_API_KEY_ID!,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[signEvmTransaction] CDP API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`CDP API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[signEvmTransaction] Transaction signed successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[signEvmTransaction] Error:`, error);
    throw error;
  }
}

/**
 * Sign EVM hash using CDP API
 * @param walletId CDP wallet ID
 * @param networkId Network ID
 * @param hash Hash to sign
 * @returns Signature
 */
export async function signEvmHash({
  walletId,
  networkId,
  hash,
}: {
  walletId: string;
  networkId: string;
  hash: string;
}) {
  try {
    console.log(`[signEvmHash] Signing EVM hash:`, {
      walletId,
      networkId,
      hash,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const requestPath = `/platform/v2/wallets/${walletId}/accounts/${networkId}/sign-hash`;
    const body = JSON.stringify({
      hash,
    });

    const signature = cdpSign({
      secret: process.env.CDP_API_KEY_SECRET!,
      timestamp,
      method,
      requestPath,
      body,
    });

    const response = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CB-ACCESS-KEY': process.env.CDP_API_KEY_ID!,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[signEvmHash] CDP API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`CDP API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[signEvmHash] Hash signed successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[signEvmHash] Error:`, error);
    throw error;
  }
}

/**
 * Send Solana transaction using CDP API
 * @param walletId CDP wallet ID
 * @param networkId Network ID (e.g., 'solana-devnet')
 * @param instructions Array of Solana instructions
 * @returns Transaction result
 */
export async function sendSolanaTransaction({
  walletId,
  networkId,
  instructions,
}: {
  walletId: string;
  networkId: string;
  instructions: any[];
}) {
  try {
    console.log(`[sendSolanaTransaction] Sending Solana transaction:`, {
      walletId,
      networkId,
      instructions,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const requestPath = `/platform/v2/wallets/${walletId}/accounts/${networkId}/transactions`;
    const body = JSON.stringify({
      instructions,
    });

    const signature = cdpSign({
      secret: process.env.CDP_API_KEY_SECRET!,
      timestamp,
      method,
      requestPath,
      body,
    });

    const response = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CB-ACCESS-KEY': process.env.CDP_API_KEY_ID!,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sendSolanaTransaction] CDP API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`CDP API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[sendSolanaTransaction] Transaction sent successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[sendSolanaTransaction] Error:`, error);
    throw error;
  }
}

/**
 * Sign Solana transaction using CDP API
 * @param walletId CDP wallet ID
 * @param networkId Network ID
 * @param instructions Array of Solana instructions
 * @returns Signed transaction
 */
export async function signSolanaTransaction({
  walletId,
  networkId,
  instructions,
}: {
  walletId: string;
  networkId: string;
  instructions: any[];
}) {
  try {
    console.log(`[signSolanaTransaction] Signing Solana transaction:`, {
      walletId,
      networkId,
      instructions,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const requestPath = `/platform/v2/wallets/${walletId}/accounts/${networkId}/sign-transaction`;
    const body = JSON.stringify({
      instructions,
    });

    const signature = cdpSign({
      secret: process.env.CDP_API_KEY_SECRET!,
      timestamp,
      method,
      requestPath,
      body,
    });

    const response = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CB-ACCESS-KEY': process.env.CDP_API_KEY_ID!,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[signSolanaTransaction] CDP API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`CDP API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[signSolanaTransaction] Transaction signed successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[signSolanaTransaction] Error:`, error);
    throw error;
  }
}

/**
 * Sign Solana message using CDP API
 * @param walletId CDP wallet ID
 * @param networkId Network ID
 * @param message Message to sign (base64 encoded)
 * @returns Signature
 */
export async function signSolanaMessage({
  walletId,
  networkId,
  message,
}: {
  walletId: string;
  networkId: string;
  message: string;
}) {
  try {
    console.log(`[signSolanaMessage] Signing Solana message:`, {
      walletId,
      networkId,
      message,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const requestPath = `/platform/v2/wallets/${walletId}/accounts/${networkId}/sign-message`;
    const body = JSON.stringify({
      message,
    });

    const signature = cdpSign({
      secret: process.env.CDP_API_KEY_SECRET!,
      timestamp,
      method,
      requestPath,
      body,
    });

    const response = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CB-ACCESS-KEY': process.env.CDP_API_KEY_ID!,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[signSolanaMessage] CDP API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`CDP API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[signSolanaMessage] Message signed successfully:`, result);
    return result;
  } catch (error) {
    console.error(`[signSolanaMessage] Error:`, error);
    throw error;
  }
}

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

// Helper to update the session context with a pending action
async function updateSession(userId: string, context: object) {
  console.log(`[updateSession] Updating session for ${userId} with context:`, context);

  // Always store context as an array of { role: 'system', content: stringified object }
  const newContextArray = [
    {
      role: 'system',
      content: JSON.stringify(context),
    },
  ];

  const { error: upsertError } = await supabase
    .from('sessions')
    .upsert({ user_id: userId, context: newContextArray, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error(`[updateSession] Error upserting session for user ${userId}:`, upsertError);
  }
}

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

  const hasEvm = wallets?.some((w) => w.chain === "base-sepolia");
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
 * @returns createNewWallet template if no wallet, or null if wallet exists
 */
async function verifyWalletExists(userId: string) {
  try {
    // Check if user has a wallet in CDP
    const wallet = await getOrCreateCdpWallet(userId);
    if (!wallet) {
      // Return a simple message instead of the template to avoid duplication
      return { text: "You need to create a wallet first." };
    }
    return null;
  } catch (error) {
    console.error("Error verifying wallet:", error);
    // Return a simple message instead of the template to avoid duplication
    return { text: "You need to create a wallet first." };
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
      text: `👋 Hi ${userName}! I'm Hedwig, your crypto assistant. I can help you send, receive, swap, and bridge tokens, and check your balances. Would you like me to create a wallet for you now? (Type 'create wallet' to get started.)`,
    };
  } else {
    return {
      text: `👋 Welcome back, ${userName}! What would you like to do today?`,
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

  // Check for a pending action in the user's session
  const { data: session } = await supabase
    .from('sessions')
    .select('context')
    .eq('user_id', userId)
    .single();

  // Extract pending_action from first 'system' context item (if any)
  let pendingAction = undefined;
  if (session?.context && Array.isArray(session.context)) {
    const systemItem = session.context.find((item: any) => item.role === 'system' && item.content);
    if (systemItem) {
      try {
        const parsed = typeof systemItem.content === 'string' ? JSON.parse(systemItem.content) : systemItem.content;
        pendingAction = parsed.pending_action;
        
        // Clear collect_email pending action if it exists (case-insensitive)
        if (pendingAction && pendingAction.toLowerCase() === 'collect_email') {
          // Remove the pending action by updating the session context
          const updatedContext = { ...parsed };
          delete updatedContext.pending_action;
          await updateSession(userId, updatedContext);
          pendingAction = undefined;
          console.log(`[handleAction] Cleared ${pendingAction} pending action for user ${userId}`);
        }
      } catch (e) { /* ignore parse errors */ }
    }
  }

  // Email collection has been removed

  // Special handling for create_wallets intent from button click
  if (intent === "create_wallets" || intent === "CREATE_WALLET" || 
      params.payload === "create_wallets" || params.payload === "CREATE_WALLET") {
    console.log("[handleAction] Create wallet button clicked or intent detected");
    console.log("[handleAction] Intent value:", intent);
    console.log("[handleAction] Params:", JSON.stringify(params));
    return await handleCreateWallets(userId);
  }

  // Handle wallet export intent
  if (intent === "export_wallet") {
    return await handleExportWallet(userId);
  }

  // Text-based balance intent matching
  if (params.text && typeof params.text === 'string') {
    const text = params.text.toLowerCase();
    if (text.includes('balance') || text.includes('wallet balance')) {
      return await handleGetWalletBalance(params, userId);
    }
  }

  // Special case for clarification intent
  if (intent === "clarification" || intent === "unknown") {
    // Check session context for a pending swap
    const { data: session } = await supabase
      .from('sessions')
      .select('context')
      .eq('user_id', userId)
      .single();
    let lastSwapQuote = null;
    let lastSwapParams = null;
    if (session && session.context && Array.isArray(session.context)) {
      for (const ctx of session.context) {
        if (ctx.role === 'system' && ctx.content) {
          try {
            const content = typeof ctx.content === 'string' ? JSON.parse(ctx.content) : ctx.content;
            if (content.lastSwapQuote && content.lastSwapParams) {
              lastSwapQuote = content.lastSwapQuote;
              lastSwapParams = content.lastSwapParams;
              break;
            }
          } catch (e) { /* ignore parse errors */ }
        }
      }
    }
    if (lastSwapQuote && lastSwapParams) {
      // Treat as swap confirmation
      return await handleSwapProcess(lastSwapParams, userId);
    }
    // Fallback: clarification/unknown
    if (intent === "clarification") {
      return {
        text: "I'm not sure what you're asking. Could you please rephrase your question?",
      };
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
      
      console.log(`[handleAction] Checking wallets for user ${userId}:`, wallets?.map(w => ({ chain: w.chain, address: w.address })));
      
      const hasEvm = wallets?.some((w) => w.chain === "base-sepolia");
      const hasSolana = wallets?.some((w) => w.chain === "solana" || w.chain === "solana-devnet");
      
      console.log(`[handleAction] Wallet check results - hasEvm: ${hasEvm}, hasSolana: ${hasSolana}`);
      
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

  // Handle price requests with new Alchemy-based token price functionality
  if (intent === "get_price") {
    try {
      const token = params.token || 'ETH';
      console.log(`[handleAction] Getting price for token: ${token}`);
      
      const priceData = await analyzeTokenPrice(token);
      const response = formatPriceResponse(priceData);
      
      return {
        text: response,
      };
    } catch (error) {
      console.error(`[handleAction] Error getting price for token:`, error);
      return {
        text: `Sorry, I couldn't fetch the price for ${params.token || 'that token'} right now. Please try again later.`,
      };
    }
  }

  if (intent === "get_news") {
    return {
      text: "News updates are currently unavailable. This feature will be enabled soon.",
    };
  }

  switch (intent) {
    case "balance":
    case "show_balance":
    case "wallet":
    case "wallet_balance":
    case "get_wallet_balance":
      return await handleGetWalletBalance(params, userId);
    case "instruction_deposit":
    case "get_wallet_address":
      // For deposit instructions or wallet address requests, show the wallet address
      return await handleGetWalletAddress(userId);
    case "send":
      console.log(`[handleAction] Processing 'send' intent with params:`, params);
      return await handleSend(params, userId);
    case "swap": {
      const swapState = params.swap_state;
      const cleanParams = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined));

      if (swapState === 'process') {
        // User has confirmed the swap from the prompt
        return await handleSwapProcess(cleanParams, userId);
      } else {
        // Initial swap request: fetch quote and show prompt
        return await handleSwapQuote(cleanParams, userId);
      }
    }
  case "send_token_prompt":
    console.log(`[handleAction] Processing 'send_token_prompt' intent with params:`, params);
    console.log(`[handleAction] WARNING: Using handleSendInit which has hardcoded fees!`);
    return await handleSendInit(params, userId);
  case "instruction_swap":
    return handleSwapInstructions();
  case "instruction_bridge":
    return handleBridgeInstructions();
  case "instruction_send":
    return handleSendInstructions();
  case "export_keys":
    return await handleExportPrivateKey(params, userId);

  default:
    return {
      text: "This feature is not supported for your current wallet or action. Please try another request or check your wallet type."
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
    const hasEvm = wallets?.some((w) => w.chain === "base-sepolia");
    const hasSolana = wallets?.some((w) => w.chain === "solana" || w.chain === "solana-devnet");
    if (!hasEvm && !hasSolana) {
      return {
        text: `Hi ${userName}, you don't have a wallet yet. Would you like to create one?`,
        ...createNewWallet(),
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
      console.error(`[handleCreateWallets] Error fetching user:`, userError);
    }

    const userName = userData?.name || `User_${userId.substring(0, 8)}`;
    console.log(`[handleCreateWallets] User name: ${userName}`);
    
    // Check if wallet already exists to prevent duplicates
    const { data: existingWallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", "base-sepolia")
      .maybeSingle();
      
    if (walletError) {
      console.error(`[handleCreateWallets] Error checking existing wallet: ${walletError.message}`);
    }
      
    if (existingWallet) {
      console.log(`[handleCreateWallets] EVM Wallet already exists: ${existingWallet.address}`);
      
      // Check for existing Solana wallet
      const { data: existingSolanaWallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .eq("chain", "solana-devnet")
        .maybeSingle();
      
      return {
        text: `You already have a wallet, ${userName}!` ,
        ...walletCreatedMulti({ 
          evm_wallet: existingWallet.address,
          solana_wallet: existingSolanaWallet?.address
        })
      };
    }

    // First, show the createNewWallet template to indicate wallet creation is in progress
    await sendWhatsAppTemplate(
      userData?.phone_number || '',
      createNewWallet(userName)
    );

    // Create EVM wallet (base-sepolia)
    const evmWallet = await getOrCreateCdpWallet(userId, 'base-sepolia');
    console.log(`[handleCreateWallets] Successfully created EVM wallet: ${evmWallet.address}`);
    
    // Create Solana wallet (solana-devnet)
    let solanaWallet = null;
    try {
      solanaWallet = await getOrCreateCdpWallet(userId, 'solana-devnet');
      console.log(`[handleCreateWallets] Successfully created Solana wallet: ${solanaWallet.address}`);
    } catch (solanaError) {
      console.error(`[handleCreateWallets] Error creating Solana wallet:`, solanaError);
      // Continue even if Solana wallet creation fails
    }

    // Return response with both EVM and Solana wallet addresses
    const response = walletCreatedMulti({ 
      evm_wallet: evmWallet.address,
      solana_wallet: solanaWallet?.address
    });
    console.log(`[handleCreateWallets] Response: ${JSON.stringify(response)}`);
    
    return response;
  } catch (error) {
    console.error("[handleCreateWallets] Error:", error);
    return { text: "Error creating wallet. Please try again later." };
  }
}

// Handler for getting wallet address
async function handleGetWalletAddress(userId: string) {
  // Get user info from Supabase for name, phone, and email
  const { data: user } = await supabase
    .from("users")
    .select("name, phone_number, email")
    .eq("id", userId)
    .single();

  if (!user) {
    console.error(`[handleGetWalletAddress] User not found for ID: ${userId}`);
    return { text: "Error fetching user details. Please try again." };
  }

  // Get EVM wallet using CDP, passing user details
  const evmWallet = await getOrCreateCdpWallet(userId);

  if (!evmWallet || !evmWallet.address) {
    return { text: "Error fetching wallet address. Please try again." };
  }

  // Get Solana wallet if it exists - check both 'solana' and 'solana-devnet' chains
  let solanaWallet = null;
  try {
    // First try 'solana' chain
    let { data: solanaWallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", "solana");
    
    // If no wallets found with 'solana', try 'solana-devnet'
    if (!solanaWallets || solanaWallets.length === 0) {
      const { data: devnetWallets } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .eq("chain", "solana-devnet");
      solanaWallets = devnetWallets;
    }
    
    // Use the first wallet if multiple exist
    solanaWallet = solanaWallets && solanaWallets.length > 0 ? solanaWallets[0] : null;
    
    // Log warning if multiple wallets found
    if (solanaWallets && solanaWallets.length > 1) {
      console.warn(`[handleGetWalletAddress] Multiple Solana wallets found for user ${userId}. Using the first one.`);
    }
    
    console.log(`[handleGetWalletAddress] Solana wallet found:`, solanaWallet?.address || 'None');
  } catch (error) {
    console.error(`[handleGetWalletAddress] Error fetching Solana wallet:`, error);
    // Continue even if Solana wallet fetch fails
  }

  return usersWalletAddresses({
    evm_wallet: evmWallet.address,
    solana_wallet: solanaWallet?.address
  });
}

// Alchemy API configuration for testnet balance fetching
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_URL_ETH = process.env.ALCHEMY_URL_ETH_SEPOLIA;
const ALCHEMY_URL_BASE = process.env.ALCHEMY_URL_BASE_SEPOLIA;
const USDC_CONTRACT_ETH = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Ethereum Sepolia USDC
const USDC_CONTRACT_BASE = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
const USDC_MINT_SOLANA = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Circle's official Solana Devnet USDC mint

/**
 * Get token balances using Alchemy Token API for testnets
 * @param address Wallet address
 * @param network Network ('ethereum-sepolia', 'base-sepolia', or 'solana-devnet')
 * @returns Object with native token and USDC balances
 */
async function getTestnetBalances(address: string, network: 'ethereum-sepolia' | 'base-sepolia' | 'solana-devnet'): Promise<{ native: string, usdc: string }> {
  try {
    console.log(`[getTestnetBalances] Fetching balances for address: ${address} on network: ${network}`);

    if (network === 'solana-devnet') {
      // Handle Solana Devnet using direct RPC calls with @solana/web3.js
      try {
        console.log(`[getTestnetBalances] Using direct Solana RPC for devnet balances`);
        
        const { Connection, PublicKey, clusterApiUrl } = await import('@solana/web3.js');
        
        // Create connection to Solana devnet
        const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
        
        // Create PublicKey from address string
        const publicKey = new PublicKey(address);
        
        // Get SOL balance (in lamports)
        const solBalanceLamports = await connection.getBalance(publicKey);
        console.log(`[getTestnetBalances] SOL Balance in lamports:`, solBalanceLamports);
        
        // Initialize balances
        let solBalance = solBalanceLamports.toString();
        let usdcBalance = '0';
        
        // Get USDC token balance if USDC mint address is available
         if (USDC_MINT_SOLANA) {
           try {
             console.log(`[getTestnetBalances] Looking for USDC token accounts with mint: ${USDC_MINT_SOLANA}`);
             const usdcMintPublicKey = new PublicKey(USDC_MINT_SOLANA);
             
             // Get token accounts for this wallet
             const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
               mint: usdcMintPublicKey,
             });
             
             console.log(`[getTestnetBalances] Found ${tokenAccounts.value.length} USDC token accounts`);
             
             if (tokenAccounts.value.length > 0) {
               // Get the balance of the first USDC token account
               const tokenAccountInfo = await connection.getTokenAccountBalance(
                 tokenAccounts.value[0].pubkey
               );
               usdcBalance = tokenAccountInfo.value.amount;
               console.log(`[getTestnetBalances] USDC Balance from token account:`, {
                 amount: usdcBalance,
                 decimals: tokenAccountInfo.value.decimals,
                 uiAmount: tokenAccountInfo.value.uiAmount
               });
             } else {
               console.log(`[getTestnetBalances] No USDC token accounts found for address ${address}`);
               
               // Also try to get all token accounts to see what tokens this address has
               const allTokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
                 programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // SPL Token Program ID
               });
               
               console.log(`[getTestnetBalances] Address has ${allTokenAccounts.value.length} total token accounts:`);
               for (const account of allTokenAccounts.value) {
                 try {
                   const accountInfo = await connection.getTokenAccountBalance(account.pubkey);
                   console.log(`[getTestnetBalances] Token account: ${account.pubkey.toString()}, Balance: ${accountInfo.value.amount}`);
                 } catch (e) {
                   console.log(`[getTestnetBalances] Could not get balance for token account: ${account.pubkey.toString()}`);
                 }
               }
             }
           } catch (usdcError) {
             console.error(`[getTestnetBalances] Error fetching USDC balance:`, usdcError);
             // Keep usdcBalance as '0' if there's an error
           }
         } else {
           console.warn(`[getTestnetBalances] USDC_MINT_SOLANA is not defined`);
         }

        console.log(`[getTestnetBalances] Parsed Solana balances - SOL: ${solBalance} lamports, USDC: ${usdcBalance}`);

        return {
          native: solBalance,
          usdc: usdcBalance,
        };
      } catch (error) {
        console.error(`[getTestnetBalances] Error fetching Solana devnet balances via RPC:`, error);
        return { native: '0', usdc: '0' };
      }
    }

    // Handle EVM testnets using Alchemy Token API
    const alchemyUrl = network === 'ethereum-sepolia' ? ALCHEMY_URL_ETH : ALCHEMY_URL_BASE;
    const usdcContract = network === 'ethereum-sepolia' ? USDC_CONTRACT_ETH : USDC_CONTRACT_BASE;
    
    if (!alchemyUrl) {
      throw new Error(`Alchemy URL for ${network} is not set. Please set ALCHEMY_URL_${network.toUpperCase().replace('-', '_')} in your environment.`);
    }

    // Get token balances using Alchemy's getTokenBalances endpoint
    const tokenBalancesResponse = await fetch(`${alchemyUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getTokenBalances',
        params: [
          address,
          [usdcContract] // Get USDC balance
        ]
      }),
    });

    // Get native token balance (ETH)
    const nativeBalanceResponse = await fetch(`${alchemyUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 2,
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest']
      }),
    });

    const [tokenData, nativeData] = await Promise.all([
      tokenBalancesResponse.json(),
      nativeBalanceResponse.json()
    ]);

    console.log(`[getTestnetBalances] Alchemy Token Response for ${network}:`, JSON.stringify(tokenData, null, 2));
    console.log(`[getTestnetBalances] Alchemy Native Response for ${network}:`, JSON.stringify(nativeData, null, 2));

    // Check for API errors
    if (tokenData.error) {
      console.error(`[getTestnetBalances] Alchemy Token API Error for ${network}:`, tokenData.error);
      throw new Error(`Alchemy Token API error: ${tokenData.error.message}`);
    }
    
    if (nativeData.error) {
      console.error(`[getTestnetBalances] Alchemy Native API Error for ${network}:`, nativeData.error);
      throw new Error(`Alchemy Native API error: ${nativeData.error.message}`);
    }

    // Parse native balance (ETH)
    const nativeBalance = BigInt(nativeData.result && nativeData.result !== '0x' ? nativeData.result : '0x0').toString();
    
    // Parse USDC balance
    let usdcBalance = '0';
    if (tokenData.result && tokenData.result.tokenBalances && tokenData.result.tokenBalances.length > 0) {
      const usdcTokenBalance = tokenData.result.tokenBalances[0];
      if (usdcTokenBalance && usdcTokenBalance.tokenBalance && usdcTokenBalance.tokenBalance !== '0x') {
        usdcBalance = BigInt(usdcTokenBalance.tokenBalance).toString();
      }
    }

    console.log(`[getTestnetBalances] Parsed balances for ${network} - Native: ${nativeBalance}, USDC: ${usdcBalance}`);

    return {
      native: nativeBalance,
      usdc: usdcBalance,
    };

  } catch (error) {
    console.error(`[getTestnetBalances] Error fetching balances for ${network}:`, error);
    // Return zero balances on failure to prevent crashes
    return { native: '0', usdc: '0' };
  }
}

/**
 * Legacy function to get token balances using Alchemy (fallback)
 */
async function getLegacyTokenBalances(address: string, network: 'eth' | 'base'): Promise<{ eth: string, usdc: string }> {
  const url = network === 'eth' ? ALCHEMY_URL_ETH : ALCHEMY_URL_BASE;
  const usdcContract = network === 'eth' ? USDC_CONTRACT_ETH : USDC_CONTRACT_BASE;

  if (!url) {
    throw new Error(`Alchemy URL for ${network} is not set. Please set the respective environment variables.`);
  }

  console.log(`[getLegacyTokenBalances] Fetching balances for address: ${address} on network: ${network}`);

  // Create payload for eth_getBalance
  const ethBalancePayload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: [address, 'latest'],
  };

  // Create payload for balanceOf USDC
  const usdcBalancePayload = {
    jsonrpc: '2.0',
    id: 2,
    method: 'eth_call',
    params: [
      {
        to: usdcContract,
        data: `0x70a08231${address.substring(2).padStart(64, '0')}`, // balanceOf(address)
      },
      'latest',
    ],
  };

  try {
    const [ethResponse, usdcResponse] = await Promise.all([
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ethBalancePayload),
      }),
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usdcBalancePayload),
      }),
    ]);

    const ethData = await ethResponse.json();
    const usdcData = await usdcResponse.json();

    // Added for debugging
    console.log('Alchemy ETH Response:', JSON.stringify(ethData, null, 2));
    console.log('Alchemy USDC Response:', JSON.stringify(usdcData, null, 2));

    if (ethData.error || usdcData.error) {
      console.error('Alchemy API Error (ETH):', ethData.error);
      console.error('Alchemy API Error (USDC):', usdcData.error);
      throw new Error(`Alchemy API error: ${ethData.error?.message || usdcData.error?.message}`);
    }
    
    // The result is a hex string, e.g., "0x...". Convert to decimal string.
    // Handle '0x' case which is invalid for BigInt, treating it as 0.
    const ethBalance = BigInt(ethData.result && ethData.result !== '0x' ? ethData.result : '0x0').toString();
    const usdcBalance = BigInt(usdcData.result && usdcData.result !== '0x' ? usdcData.result : '0x0').toString();

    return {
      eth: ethBalance,
      usdc: usdcBalance,
    };
  } catch (error) {
    console.error('Error fetching balances via eth_call:', error);
    // Return zero balances on failure to prevent crashes
    return { eth: '0', usdc: '0' };
  }
}

/**
 * Get token balances using legacy Alchemy method
 */
async function getTokenBalances(address: string, network: 'eth' | 'base'): Promise<{ eth: string, usdc: string }> {
  return getLegacyTokenBalances(address, network);
}


/**
 * Handle wallet balance action - Fetches balances from Base and Ethereum mainnets using CDP API.
 * @param params Action parameters
 * @param userId User ID
 * @returns Response with wallet balance template
 */
async function handleGetWalletBalance(params: ActionParams, userId: string) {
  try {
    console.log(`[handleGetWalletBalance] Starting balance check for user ${userId}`);
    
    // Clear any pending actions in the session context
    const { data: session } = await supabase
      .from('sessions')
      .select('context')
      .eq('user_id', userId)
      .single();

    if (session?.context && Array.isArray(session.context)) {
      const systemItem = session.context.find((item: any) => item.role === 'system' && item.content);
      if (systemItem) {
        try {
          const parsed = typeof systemItem.content === 'string' ? JSON.parse(systemItem.content) : systemItem.content;
          if (parsed.pending_action && parsed.pending_action.toLowerCase() === 'collect_email') {
            // Remove the pending action
            const updatedContext = { ...parsed };
            delete updatedContext.pending_action;
            await updateSession(userId, updatedContext);
            console.log(`[handleGetWalletBalance] Cleared collect_email pending action for user ${userId}`);
          }
        } catch (e) { /* ignore parse errors */ }
      }
    }

    // Get EVM wallet - check for both testnet and mainnet chains
    let { data: evmWallets } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", "evm");

    // Use the first wallet if multiple exist
    const evmWallet = evmWallets && evmWallets.length > 0 ? evmWallets[0] : null;
    
    // Log warning if multiple wallets found
    if (evmWallets && evmWallets.length > 1) {
      console.warn(`[handleGetWalletBalance] Multiple EVM wallets found for user ${userId}. Using the first one.`);
    }

    // Get Solana wallet if it exists - check both 'solana' and 'solana-devnet' chains
    let { data: solanaWallets } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", "solana");
      
    // Use the first wallet if multiple exist
    const solanaWallet = solanaWallets && solanaWallets.length > 0 ? solanaWallets[0] : null;
    
    // Log warning if multiple wallets found
    if (solanaWallets && solanaWallets.length > 1) {
      console.warn(`[handleGetWalletBalance] Multiple Solana wallets found for user ${userId}. Using the first one.`);
    }
    
    console.log(`[handleGetWalletBalance] EVM wallet found:`, evmWallet?.address || 'None');
    console.log(`[handleGetWalletBalance] Solana wallet found:`, solanaWallet?.address || 'None');

    // Check if user has any wallets at all
    if (!evmWallet && !solanaWallet) {
      console.log(`[handleGetWalletBalance] No wallets found for user ${userId}`);
      return { text: "You need to create a wallet first." };
    }

    // Initialize balance objects with default values
    let baseBalances = { eth: '0', usdc: '0' };
    let ethBalances = { eth: '0', usdc: '0' };
    let solanaBalances = { sol: '0', usdc: '0' };

    // Fetch EVM balances if wallet exists
    if (evmWallet?.address) {
      try {
        console.log(`[handleGetWalletBalance] Fetching EVM testnet balances for ${evmWallet.address}`);
        
        // Use Alchemy Token API for testnet networks
        const [baseBalanceData, ethBalanceData] = await Promise.all([
          getTestnetBalances(evmWallet.address, 'base-sepolia'),
          getTestnetBalances(evmWallet.address, 'ethereum-sepolia')
        ]);
        
        // Update balance objects with testnet data
        baseBalances = {
          eth: baseBalanceData.native,
          usdc: baseBalanceData.usdc
        };
        
        ethBalances = {
          eth: ethBalanceData.native,
          usdc: ethBalanceData.usdc
        };
        
        console.log(`[handleGetWalletBalance] EVM testnet balances fetched - Base Sepolia: ${JSON.stringify(baseBalances)}, Ethereum Sepolia: ${JSON.stringify(ethBalances)}`);
      } catch (error) {
        console.error(`[handleGetWalletBalance] Error fetching EVM testnet balances:`, error);
        // Keep default zero values
      }
    }

    // Fetch Solana balances if wallet exists
    if (solanaWallet?.address) {
      try {
        console.log(`[handleGetWalletBalance] Fetching Solana devnet balances for ${solanaWallet.address}`);
        
        // Use getTestnetBalances for Solana devnet
        const solanaBalanceData = await getTestnetBalances(solanaWallet.address, 'solana-devnet');
        
        // Update balance object with devnet data
        solanaBalances = {
          sol: solanaBalanceData.native,
          usdc: solanaBalanceData.usdc
        };
        
        console.log(`[handleGetWalletBalance] Solana devnet balances fetched:`, JSON.stringify(solanaBalances));
      } catch (error) {
        console.error(`[handleGetWalletBalance] Error fetching Solana devnet balances:`, error);
        // Keep default zero values
      }
    }

    // Format balances for the template
    const formattedBalances = {
      base_eth: formatBalance(baseBalances.eth, 18),
      base_usdc: formatBalance(baseBalances.usdc, 6),
      eth_eth: formatBalance(ethBalances.eth, 18),
      eth_usdc: formatBalance(ethBalances.usdc, 6),
      sol_sol: formatBalance(solanaBalances.sol, 9), // SOL has 9 decimals
      sol_usdc: formatBalance(solanaBalances.usdc, 6) // USDC has 6 decimals
    };

    console.log(`[handleGetWalletBalance] Formatted balances:`, JSON.stringify(formattedBalances));

    return walletBalance(formattedBalances);
  } catch (error) {
    console.error("Error getting wallet balance:", error);
    return sendFailed({ reason: "Could not fetch wallet balance." });
  }
}

// Helper to get ETH and USDC balance as a string for swap success
async function getWalletBalanceString(userId: string): Promise<string> {
  try {
    // Get user's EVM wallet
    const { data: evmWallets } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", "evm");

    const evmWallet = evmWallets && evmWallets.length > 0 ? evmWallets[0] : null;
    
    if (!evmWallet?.address) {
      return 'ETH: ?, USDC: ?';
    }

    // Get Base Sepolia testnet balances
    const baseBalances = await getTestnetBalances(evmWallet.address, 'base-sepolia');
    return `ETH: ${formatBalance(baseBalances.native, 18)}, USDC: ${formatBalance(baseBalances.usdc, 6)}`;
  } catch (error) {
    console.error('Error in getWalletBalanceString:', error);
    return 'ETH: ?, USDC: ?';
  }
}

// Deprecated: Use handleSwapQuote and handleSwapProcess for swap flows.
// function handleSwapTokens(params: ActionParams, userId: string) { /* deprecated */ }

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

// Multi-step send flow support - now uses CDP
// Helper function to validate Ethereum addresses
function isValidEthereumAddress(address: string): boolean {
  if (!address) return false;
  
  // Check if it's a valid Ethereum address format
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (ethAddressRegex.test(address)) {
    return true;
  }
  
  // Check if it's an ENS name
  if (address.endsWith('.eth') && address.length > 4) {
    return true;
  }
  
  return false;
}

function isValidSolanaAddress(address: string): boolean {
  if (!address) return false;
  
  // Solana addresses are base58 encoded and typically 32-44 characters long
  const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return solanaAddressRegex.test(address);
}

function detectAddressType(address: string): 'ethereum' | 'solana' | 'invalid' {
  if (isValidEthereumAddress(address)) {
    return 'ethereum';
  }
  if (isValidSolanaAddress(address)) {
    return 'solana';
  }
  return 'invalid';
}

function isValidAddress(address: string): boolean {
  return detectAddressType(address) !== 'invalid';
}

async function handleSend(params: ActionParams, userId: string) {
  try {
    console.log(`[handleSend] Processing send request for user ${userId}:`, params);
    
    // Get current session context to check for stored parameters
    const { data: session } = await supabase
      .from('sessions')
      .select('context')
      .eq('user_id', userId)
      .single();

    let storedContext: any = {};
    if (session?.context && Array.isArray(session.context)) {
      const systemItem = session.context.find((item: any) => item.role === 'system' && item.content);
      if (systemItem) {
        try {
          const parsed = typeof systemItem.content === 'string' ? JSON.parse(systemItem.content) : systemItem.content;
          if (parsed.pending_transaction) {
            storedContext = parsed.pending_transaction;
            console.log(`[handleSend] Found stored transaction context:`, storedContext);
          }
        } catch (e) {
          console.log(`[handleSend] Could not parse stored context:`, e);
        }
      }
    }

    const isExecute = params.isExecute === true;
    
    // Merge stored context with new parameters (new parameters take precedence)
    const token = params.token || storedContext.token || 'ETH';
    const amount = params.amount || storedContext.amount || '';
    const recipient = params.recipient || storedContext.recipient || '';
    const network = (params.network || storedContext.network || 'base-sepolia').toLowerCase().replace(' ', '-');

    console.log(`[handleSend] Merged parameters - Token: ${token}, Amount: ${amount}, Recipient: ${recipient}, Network: ${network}, isExecute: ${isExecute}`);

    // Check if we have all required parameters
    if (!amount || !recipient) {
      console.log(`[handleSend] Missing parameters: amount=${amount}, recipient=${recipient}`);
      
      // Store partial transaction data in session context
      const partialTransaction = {
        token,
        amount: amount || undefined,
        recipient: recipient || undefined,
        network
      };

      await updateSession(userId, { pending_transaction: partialTransaction });
      
      // Provide context-aware error messages
      let errorMessage = '';
      if (!amount && !recipient) {
        errorMessage = 'Please specify both the amount and recipient address for the transaction. For example: "send 0.01 ETH to 0x1234..." or "send 1 SOL to ABC123..."';
      } else if (!amount) {
        errorMessage = `Please specify the amount to send to ${recipient}. For example: "send 0.01 ${token}"`;
      } else if (!recipient) {
        errorMessage = `Please provide the recipient wallet address for sending ${amount} ${token}. You can paste the full address.`;
      }
      
      const failResp = sendFailed({ reason: errorMessage });
      console.log('[handleSend] Returning:', failResp);
      return failResp;
    }
    
    // Validate recipient address format and detect address type
    const addressType = detectAddressType(recipient);
    if (addressType === 'invalid') {
      console.log(`[handleSend] Invalid recipient address format: ${recipient}`);
      const failResp = sendFailed({ 
        reason: 'Invalid recipient address format. Please provide a valid Ethereum address (0x...), ENS name (.eth), or Solana address. Make sure the address is complete and correctly formatted.' 
      });
      console.log('[handleSend] Returning:', failResp);
      return failResp;
    }

    // Determine the appropriate network and token based on address type and user preference
    let finalNetwork = network;
    let finalToken = token;
    
    if (addressType === 'solana') {
      // For Solana addresses, always use Solana network
      finalNetwork = 'solana-devnet';
      if (token.toLowerCase() === 'eth') {
        finalToken = 'SOL';
      }
    } else if (addressType === 'ethereum') {
      // For Ethereum addresses, determine the appropriate EVM network based on explicit user intent
      console.log(`[handleSend] Processing Ethereum address with network input: "${network}"`);
      
      if (network.includes('solana')) {
        // If user specified Solana but address is Ethereum, default to Base Sepolia
        console.log(`[handleSend] User specified Solana but address is Ethereum, defaulting to Base Sepolia`);
        finalNetwork = 'base-sepolia';
      } else if (network.includes('ethereum') || network === 'ethereum-sepolia') {
        // User explicitly wants Ethereum Sepolia
        console.log(`[handleSend] User wants Ethereum Sepolia`);
        finalNetwork = 'ethereum-sepolia';
      } else if (network.includes('base') || network === 'base-sepolia') {
        // User explicitly wants Base Sepolia
        console.log(`[handleSend] User wants Base Sepolia`);
        finalNetwork = 'base-sepolia';
      } else {
        // For any other case, default to Base Sepolia (safer default)
        console.log(`[handleSend] No specific network detected, defaulting to Base Sepolia`);
        finalNetwork = 'base-sepolia';
      }
    }

    console.log(`[handleSend] Address type: ${addressType}, Final network: ${finalNetwork}, Final token: ${finalToken}`);

    // Clear stored transaction context since we have all parameters
    await updateSession(userId, {});

    // If this is not an execution request, return the confirmation prompt template
    if (!isExecute) {
      console.log(`[handleSend] Returning send_token_prompt template for confirmation`);
      
      // Determine transaction type for fee estimation
      const transactionType = finalToken === 'USDC' ? 'token' : 'native';
      console.log(`[handleSend] Fee estimation - Network: ${finalNetwork}, Transaction type: ${transactionType}, Token: ${finalToken}`);
      console.log(`[handleSend] About to call estimateTransactionFee with network: "${finalNetwork}" and type: "${transactionType}"`);
      
      // Get actual estimated fee
      const estimatedFee = await estimateTransactionFee(finalNetwork, transactionType);
      console.log(`[handleSend] Estimated fee result: ${estimatedFee}`);
      console.log(`[handleSend] Fee estimation complete - returning fee: "${estimatedFee}" for network: "${finalNetwork}"`);
      
      // Format network name for display
      let networkDisplayName = finalNetwork;
      if (finalNetwork === 'solana-devnet') {
        networkDisplayName = 'Solana Devnet';
      } else if (finalNetwork === 'ethereum-sepolia') {
        networkDisplayName = 'Ethereum Sepolia';
      } else if (finalNetwork === 'base-sepolia') {
        networkDisplayName = 'Base Sepolia';
      }
      
      console.log(`[handleSend] Creating sendTokenPrompt with fee: "${estimatedFee}" and network display: "${networkDisplayName}"`);
      
      const promptResp = sendTokenPrompt({
        amount: amount,
        token: finalToken,
        recipient: formatAddress(recipient),
        network: networkDisplayName,
        fee: estimatedFee,
        estimatedTime: '30-60 seconds',
      });
      console.log('[handleSend] Returning:', promptResp);
      return promptResp;
    }

    // This is an execution request
    console.log(`[handleSend] Executing transaction: ${amount} ${finalToken} to ${recipient} on ${finalNetwork}`);

    try {
      // Get user's appropriate wallet based on address type
      let wallet;
      if (addressType === 'solana') {
        // Get or create Solana wallet
        wallet = await getOrCreateCdpWallet(userId, 'solana-devnet');
      } else {
        // Get or create EVM wallet based on the final network
        wallet = await getOrCreateCdpWallet(userId, finalNetwork);
      }
      
      if (!wallet || !wallet.address) {
        throw new Error('Could not get CDP wallet');
      }

      // Validate amount
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Invalid amount specified. Please provide a valid positive number.');
      }

      // Execute the transaction based on token type and network
      let txResult;
      let explorerUrl;

      // Define token contract addresses
      const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
      const USDC_SOLANA_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
      const USDC_ETHEREUM_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // USDC on Ethereum Sepolia

      if (finalNetwork === 'solana-devnet') {
        if (finalToken === 'USDC') {
          // Transfer USDC on Solana
          txResult = await transferToken(
            wallet.address, 
            recipient, 
            USDC_SOLANA_DEVNET, 
            numericAmount.toString(), 
            6, // USDC has 6 decimals
            'solana-devnet'
          );
        } else {
          // Transfer SOL
          txResult = await transferNativeToken(wallet.address, recipient, numericAmount.toString(), 'solana-devnet');
        }
        explorerUrl = `https://explorer.solana.com/tx/${txResult.hash}?cluster=devnet`;
      } else if (finalNetwork === 'ethereum-sepolia') {
        if (finalToken === 'USDC') {
          // Transfer USDC on Ethereum Sepolia
          txResult = await transferToken(
            wallet.address, 
            recipient, 
            USDC_ETHEREUM_SEPOLIA, 
            numericAmount.toString(), 
            6, // USDC has 6 decimals
            'ethereum-sepolia'
          );
        } else {
          // Transfer ETH
          txResult = await transferNativeToken(wallet.address, recipient, numericAmount.toString(), 'ethereum-sepolia');
        }
        explorerUrl = `https://sepolia.etherscan.io/tx/${txResult.hash}`;
      } else {
        // Default to Base Sepolia
        if (finalToken === 'USDC') {
          // Transfer USDC on Base Sepolia
          txResult = await transferToken(
            wallet.address, 
            recipient, 
            USDC_BASE_SEPOLIA, 
            numericAmount.toString(), 
            6, // USDC has 6 decimals
            'base-sepolia'
          );
        } else {
          // Transfer ETH
          txResult = await transferNativeToken(wallet.address, recipient, numericAmount.toString(), 'base-sepolia');
        }
        explorerUrl = `https://sepolia.basescan.org/tx/${txResult.hash}`;
      }

      console.log(`[handleSend] Transaction result:`, txResult);
      console.log(`[handleSend] Returning tx_sent_success template with explorerUrl: ${explorerUrl}`);

      const successResp = sendSuccessSanitized({
        amount: amount,
        token: finalToken,
        recipient: formatAddress(recipient),
        explorerUrl: explorerUrl,
      });
      console.log('[handleSend] Returning:', successResp);
      return successResp;
    } catch (sendError: any) {
      console.error(`[handleSend] Error sending transaction:`, sendError);
      const failResp = { text: sendError.message || 'Error sending transaction. Please try again later.' };
      console.log('[handleSend] Returning:', failResp);
      return failResp;
    }
  } catch (error: any) {
    console.error(`[handleSend] Error:`, error);
    const failResp = { text: error.message || 'An unexpected error occurred. Please try again later.' };
    console.log('[handleSend] Returning:', failResp);
    return failResp;
  }
}

async function handleExportWallet(userId: string) {
  try {
    console.log(`[handleExportWallet] Export wallet requested for user ${userId}`);

    // Get user's wallet from CDP
    const wallet = await getOrCreateCdpWallet(userId);
    if (!wallet || !wallet.address) {
      // Return a simple message instead of the template to avoid duplication
      return { text: "You need to create a wallet first." };
    }

    // For CDP wallets, we can't export private keys directly as they're managed by CDP
    // Instead, provide information about the wallet and suggest alternatives
    return {
      text: `Your wallet address is: ${wallet.address}\n\nNote: This is a CDP-managed wallet for security. Private keys are securely stored by Coinbase and cannot be exported. If you need a self-custodial wallet, you can create one using other wallet providers.`
    };

  } catch (error) {
    console.error('[handleExportWallet] Error:', error);
    return { text: 'An error occurred while retrieving your wallet information. Please try again later.' };
  }
}

// Export keys functionality is disabled

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
      .eq("chain", network.toLowerCase() === "solana" ? "solana" : "base-sepolia")
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

// Generate JWT for CDP API authentication
async function generateCDPJWT(method: string, path: string, body?: string): Promise<string> {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  
  if (!apiKeyId || !apiKeySecret) {
    throw new Error('CDP API credentials not configured');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKeyId,
    iat: timestamp,
    exp: timestamp + 300, // 5 minutes
    aud: 'cdp',
    sub: apiKeyId,
    method: method,
    path: path,
    body: body || ''
  };

  // Create JWT header
  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: apiKeyId
  };

  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  // Create signature using the API key secret
  const crypto = require('crypto');
  const sign = crypto.createSign('SHA256');
  sign.update(`${encodedHeader}.${encodedPayload}`);
  const signature = sign.sign(apiKeySecret, 'base64url');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Handler for getting a swap quote using CDP Swap API
async function handleSwapQuote(params: ActionParams, userId: string) {
  try {
    console.log(`[Swap] Getting swap quote for user ${userId}, params:`, params);

    // Get wallet address
    const wallet = await getOrCreateCdpWallet(userId, 'base-sepolia');
    if (!wallet || !wallet.address) {
      return { text: "You need to create a wallet first." };
    }

    // Ensure we have a valid phone number for WhatsApp
    let phoneNumber = params.phoneNumber;
    if (!phoneNumber) {
      const { data: user } = await supabase
        .from("users")
        .select("phone_number")
        .eq("id", userId)
        .single();
      phoneNumber = user?.phone_number || '';
    }

    // Parse params first to use in quotePending
    const fromToken = (params.fromToken || params.from_token || 'USDC').toUpperCase();
    const toToken = (params.toToken || params.to_token || 'ETH').toUpperCase();

    // Immediately send WhatsApp quote_pending template
    if (phoneNumber) {
      await sendWhatsAppTemplate(phoneNumber, quotePending());
    }

    const amount = params.amount || '1';
    const network = 'base-sepolia'; // Using testnet
    
    // Token addresses for Base Sepolia testnet
    const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const fromTokenAddress = fromToken === 'USDC' ? USDC_ADDRESS : ETH_ADDRESS;
    const toTokenAddress = toToken === 'USDC' ? USDC_ADDRESS : ETH_ADDRESS;
    const decimals = fromToken === 'USDC' ? 6 : 18;
    const formattedAmount = (Number(amount) * 10 ** decimals).toString();

    // First get price estimate from CDP API
    const priceEstimateUrl = `https://api.cdp.coinbase.com/v2/swaps/price-estimate`;
    const priceEstimateBody = {
      network: network,
      from_token: fromTokenAddress,
      to_token: toTokenAddress,
      from_amount: formattedAmount,
      taker: wallet.address
    };

    console.log('[Swap] Getting price estimate:', priceEstimateBody);

    const priceResponse = await fetch(priceEstimateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await generateCDPJWT('POST', '/v2/swaps/price-estimate', JSON.stringify(priceEstimateBody))}`,
      },
      body: JSON.stringify(priceEstimateBody),
    });

    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      console.error('[handleSwapQuote] CDP price estimate error:', errorText);
      return { text: 'Failed to get price estimate from CDP. Please try again later.' };
    }

    const priceData = await priceResponse.json();
    console.log("[Swap] CDP Price Estimate Response:", JSON.stringify(priceData, null, 2));

    if (!priceData.to_amount || !priceData.from_amount) {
      console.error('[Swap] Invalid price estimate response from CDP', priceData);
      return { text: 'Could not fetch a valid price estimate. There might be an issue with the trading pair or liquidity.' };
    }

    // Create swap quote from CDP API
    const swapQuoteUrl = `https://api.cdp.coinbase.com/v2/swaps/quote`;
    const swapQuoteBody = {
      network: network,
      from_token: fromTokenAddress,
      to_token: toTokenAddress,
      from_amount: formattedAmount,
      taker: wallet.address
    };

    console.log('[Swap] Creating swap quote:', swapQuoteBody);

    const quoteResponse = await fetch(swapQuoteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await generateCDPJWT('POST', '/v2/swaps/quote', JSON.stringify(swapQuoteBody))}`,
      },
      body: JSON.stringify(swapQuoteBody),
    });

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error('[handleSwapQuote] CDP swap quote error:', errorText);
      return { text: 'Failed to create swap quote from CDP. Please try again later.' };
    }

    const quoteData = await quoteResponse.json();
    console.log("[Swap] CDP Swap Quote Response:", JSON.stringify(quoteData, null, 2));

    if (!quoteData.to_amount || !quoteData.from_amount) {
      console.error('[Swap] Invalid swap quote response from CDP', quoteData);
      return { text: 'Could not create a valid swap quote. Please try again later.' };
    }

    // Save quote info in session for use in swapProcess
    await supabase.from('sessions').upsert([
      {
        user_id: userId,
        context: [
          {
            role: 'system',
            content: JSON.stringify({
              lastSwapQuote: quoteData,
              lastSwapParams: { fromToken, toToken, amount, chain: 'base-sepolia' },
            }),
          },
        ],
        updated_at: new Date().toISOString(),
      },
    ], { onConflict: 'user_id' });

    // Format output amount and fee
    const fromTokenDecimals = fromToken === 'USDC' ? 6 : 18;
    const toTokenDecimals = toToken === 'USDC' ? 6 : 18;
    const fromAmountFmt = formatUnits(BigInt(quoteData.from_amount), fromTokenDecimals);
    const toAmountFmt = formatUnits(BigInt(quoteData.to_amount), toTokenDecimals);
    
    // Estimate gas fee (CDP provides gas estimate in the quote)
    const gasFee = quoteData.gas_estimate ? formatUnits(BigInt(quoteData.gas_estimate), 18) : '0.001';
    const gasFeeFormatted = parseFloat(gasFee).toFixed(6);

    // Send swapPrompt via WhatsApp with all quote details
    if (phoneNumber) {
      await sendWhatsAppTemplate(phoneNumber, swapPrompt({
        from_amount: `${parseFloat(fromAmountFmt).toFixed(4)} ${fromToken}`,
        to_amount: `${parseFloat(toAmountFmt).toFixed(4)} ${toToken}`,
        fee: `${gasFeeFormatted} ETH`,
        chain: 'Base Sepolia',
        est_time: '30s',
      }));
    }

    return { text: "Swap quote sent. Please check WhatsApp for details and confirmation." };
  } catch (error) {
    console.error("[Swap] Error getting swap quote:", error);
    return { text: "Failed to get swap quote. Please try again later." };
  }
}

// Handler for processing a swap using CDP Swap API
async function handleSwapProcess(params: ActionParams, userId: string) {
  try {
    console.log(`[Swap] Processing swap for user ${userId}`);
    
    // Get wallet address
    const wallet = await getOrCreateCdpWallet(userId, 'base-sepolia');
    if (!wallet || !wallet.address) {
      return { text: "You need to create a wallet first." };
    }

    // Ensure we have a valid phone number for WhatsApp
    let phoneNumber = params.phoneNumber;
    if (!phoneNumber) {
      const { data: user } = await supabase
        .from("users")
        .select("phone_number")
        .eq("id", userId)
        .single();
      phoneNumber = user?.phone_number || '';
    }

    // Get last swap quote from session
    const { data: session } = await supabase
      .from('sessions')
      .select('context')
      .eq('user_id', userId)
      .single();
      
    let lastSwapQuote = null;
    let lastSwapParams = null;
    if (session?.context) {
      const last = session.context.find((item: any) => item.role === 'system' && JSON.parse(item.content)?.lastSwapQuote);
      if (last) {
        const content = JSON.parse(last.content);
        lastSwapQuote = content.lastSwapQuote;
        lastSwapParams = content.lastSwapParams;
      }
    }
    
    if (!lastSwapQuote) {
      return { text: "No swap quote found to process. Please request a new quote." };
    }

    // Send processing notification
    if (phoneNumber) {
      await sendWhatsAppTemplate(phoneNumber, swapProcessing());
    }

    try {
      // Execute the swap using CDP Wallet API
      const swapUrl = `https://api.cdp.coinbase.com/v2/wallets/${wallet.address}/swaps`;
      const swapBody = {
        quote_id: lastSwapQuote.quote_id || lastSwapQuote.id,
        network: 'base-sepolia'
      };

      console.log('[Swap] Executing swap:', swapBody);

      const swapResponse = await fetch(swapUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await generateCDPJWT('POST', `/v2/wallets/${wallet.address}/swaps`, JSON.stringify(swapBody))}`,
        },
        body: JSON.stringify(swapBody),
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        console.error('[handleSwapProcess] CDP swap execution error:', errorText);
        
        if (phoneNumber) {
          await sendWhatsAppTemplate(phoneNumber, swapFailed({ 
            reason: 'Failed to execute swap. Please try again later.' 
          }));
        }
        return { text: 'Failed to execute swap. Please try again later.' };
      }

      const swapResult = await swapResponse.json();
      console.log("[Swap] CDP Swap Execution Response:", JSON.stringify(swapResult, null, 2));

      // Get transaction hash from the result
      const txHash = swapResult.transaction_hash || swapResult.hash;
      
      if (txHash) {
        // Send success notification
        if (phoneNumber) {
          const fromToken = lastSwapParams?.fromToken || 'USDC';
          const toToken = lastSwapParams?.toToken || 'ETH';
          const amount = lastSwapParams?.amount || '1';
          
          await sendWhatsAppTemplate(phoneNumber, swapSuccessful({
            success_message: `Successfully swapped ${amount} ${fromToken} to ${toToken}`,
            wallet_balance: await getWalletBalanceString(userId),
            tx_hash: txHash
          }));
        }

        return { 
          text: `Swap completed successfully! Transaction hash: ${txHash}. Check WhatsApp for details.` 
        };
      } else {
        console.error('[Swap] No transaction hash in swap result:', swapResult);
        return { text: 'Swap initiated but transaction hash not available. Please check your wallet.' };
      }

    } catch (swapError) {
      console.error('[Swap] Error executing swap:', swapError);
      
      if (phoneNumber) {
        await sendWhatsAppTemplate(phoneNumber, swapFailed({ 
          reason: 'Swap execution failed. Please try again later.' 
        }));
      }
      
      return { text: 'Failed to execute swap. Please try again later.' };
    }

  } catch (error) {
    console.error("[Swap] Error processing swap:", error);
    return { text: "Failed to process swap. Please try again later." };
  }
}


// Handler for initiating a token send
async function handleSendInit(params: ActionParams, userId: string) {
  try {
    console.log(`[handleSendInit] Initiating send for user ${userId} with params:`, params);

    // Get send parameters
    const token = params.token || "ETH";
    const amount = params.amount || "0.01";
    const recipient = params.recipient || params.to || "0x...";
    const network = params.network || params.chain || "Base Sepolia";
    const estimatedTime = params.estimatedTime || "1-5 mins";
    
    // Determine transaction type for fee estimation
    const transactionType = token === 'USDC' ? 'token' : 'native';
    console.log(`[handleSendInit] Fee estimation - Network: ${network}, Transaction type: ${transactionType}, Token: ${token}`);
    
    // Get actual estimated fee instead of using hardcoded values
    let estimatedFee;
    try {
      // Map display network names to internal network names
      let internalNetwork = network;
      if (network === 'Solana Devnet') {
        internalNetwork = 'solana-devnet';
      } else if (network === 'Base Sepolia') {
        internalNetwork = 'base-sepolia';
      } else if (network === 'Ethereum Sepolia') {
        internalNetwork = 'ethereum-sepolia';
      }
      
      console.log(`[handleSendInit] Calling estimateTransactionFee with network: "${internalNetwork}" and type: "${transactionType}"`);
      estimatedFee = await estimateTransactionFee(internalNetwork, transactionType);
      console.log(`[handleSendInit] Estimated fee result: ${estimatedFee}`);
    } catch (error) {
      console.error(`[handleSendInit] Error estimating fee:`, error);
      // Fallback to network-appropriate default
      estimatedFee = network.toLowerCase().includes('solana') ? "0.000005 SOL" : "0.0001 ETH";
      console.log(`[handleSendInit] Using fallback fee: ${estimatedFee}`);
    }
    
    // Return the interactive message with confirm/cancel buttons
    console.log(`[handleSendInit] Creating sendTokenPrompt with fee: "${estimatedFee}"`);
    return sendTokenPrompt({
      amount,
      token,
      recipient,
      network,
      fee: estimatedFee,
      estimatedTime,
    });
  } catch (error) {
    console.error("[handleSendInit] Error initiating send:", error);
    return { text: "Failed to initiate send. Please try again later." };
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
      .eq("chain", network.toLowerCase() === "solana" ? "solana" : "base-sepolia")
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

import { toE164 } from '@/lib/phoneFormat';

async function handleExportPrivateKey(params: ActionParams, userId: string) {
  try {
    console.log(`[handleExportPrivateKey] Initiating private key export for user ${userId}`);

    // Get user's phone number and email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('phone_number, email')
      .eq('id', userId)
      .single();

    // If user does not exist, prompt onboarding
    if (userError || !user) {
      console.error(`[handleExportPrivateKey] Error fetching user data:`, userError);
      return {
        text: "It looks like you haven't onboarded yet. Please get started by providing your email address so I can create your secure wallet.",
      };
    }

    // If user exists but has no email, prompt for email and set pending_action
    if (!user.email) {
      await updateSession(userId, { pending_action: 'COLLECT_EMAIL' });
      return {
        text: "Before I can export your wallet, please provide your email address for security.",
      };
    }

    // Get user's wallet from CDP
    const wallet = await getOrCreateCdpWallet(userId);
    if (!wallet || !wallet.address) {
      // Return a simple message instead of the template to avoid duplication
      return { text: "You need to create a wallet first." };
    }

    // For CDP wallets, we can't export private keys directly as they're managed by CDP
    return {
      text: `Your wallet address is: ${wallet.address}\n\nNote: This is a CDP-managed wallet for security. Private keys are securely stored by Coinbase and cannot be exported. If you need a self-custodial wallet, you can create one using other wallet providers.`
    };

  } catch (error) {
    console.error(`[handleExportPrivateKey] Error:`, error);
    return { text: 'An error occurred while retrieving your wallet information. Please try again later.' };
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
      .eq("chain", network.toLowerCase() === "solana" ? "solana" : "base-sepolia")
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
      .eq("chain", "base-sepolia")
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
          .select("user_id, chain")
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
