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
import { BlockRadarClient } from "@/lib/blockRadar";
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

// Create BlockRadar client
const blockRadar = new BlockRadarClient(process.env.BLOCK_RADAR_API_KEY || '');

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
 * @returns noWalletYet template if no wallet, or null if wallet exists
 */
async function verifyWalletExists(userId: string) {
  try {
    // Check if user has a wallet in BlockRadar
    const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: '', chain: "base-sepolia" });
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
      const hasEvm = wallets?.some((w) => w.chain === "base-sepolia");
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
    case "balance":
    case "show_balance":
    case "wallet":
    case "wallet_balance":
    case "my_wallet":
    case "check_balance":
      return await handleGetWalletBalance(params, userId);
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
    break;
  case "send_token_prompt":

      return await handleSendInit(params, userId);
    case "instruction_swap":
      return handleSwapInstructions();
    case "instruction_bridge":
      return handleBridgeInstructions();
    case "instruction_send":
      return handleSendInstructions();
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
      .eq("chain", "base-sepolia")
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
    const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: userData?.phone_number, chain: "base-sepolia", name: userName });
    
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
  // Only return the wallet address template, no fallback or error after success
  // Get user info from Supabase for name
  const { data: user } = await supabase
    .from("users")
    .select("name")
    .eq("id", userId)
    .single();

  const userName = user?.name || `User_${userId.substring(0, 8)}`;

  // Get wallet using CDP
  const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: '', chain: "base-sepolia" });

  if (!wallet || !wallet.address) {
    return { text: "Error fetching wallet address. Please try again." };
  }

  return usersWalletAddresses({
    evm_wallet: wallet.address,
  });
}

// Helper to fetch Sepolia ETH balance via Coinbase developer RPC
async function getSepoliaEthBalanceViaRpc(address: string): Promise<string> {
  const rpcUrl = 'https://api.developer.coinbase.com/rpc/v1/base-sepolia/QPwHIcurQPClYOPIGNmRONEHGmZUXikg';
  const body = {
    jsonrpc: '2.0',
    method: 'eth_getBalance',
    params: [address, 'latest'],
    id: 1
  };
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  console.log('[getSepoliaEthBalanceViaRpc] RPC response:', data);
  if (data.result && data.result !== '0x') {
    return (parseInt(data.result, 16) / 1e18).toString();
  }
  return '0';
}

// Helper to fetch Sepolia USDC balance via Coinbase developer RPC
async function getSepoliaUsdcBalanceViaRpc(address: string): Promise<string> {
  const rpcUrl = 'https://api.developer.coinbase.com/rpc/v1/base-sepolia/QPwHIcurQPClYOPIGNmRONEHGmZUXikg';
  // USDC contract address on Base Sepolia
  const usdcContract = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  // ERC20 balanceOf(address) ABI: 0x70a08231 + 24 zeros + address (without 0x)
  const data = '0x70a08231000000000000000000000000' + address.replace(/^0x/, '');
  const body = {
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{
      to: usdcContract,
      data: data
    }, 'latest'],
    id: 1
  };
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await resp.json();
  console.log('[getSepoliaUsdcBalanceViaRpc] RPC response:', result);
  if (result.result && result.result !== '0x') {
    return (parseInt(result.result, 16) / 1e6).toString();
  }
  return '0';
}

/**
 * Handle wallet balance action - Fetch real wallet balances using CDP Onchain Data API
 * @param params Action parameters
 * @param userId User ID
 * @returns Response with wallet balance template
 */
async function handleGetWalletBalance(params: ActionParams, userId: string) {
  try {
    // Get the user's EVM wallet from Supabase
    const { data: evmWallet, error } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("chain", "base-sepolia")
      .single();
    if (error) {
      console.error("[handleGetWalletBalance] Error fetching wallet:", error);
      return { text: "Failed to retrieve your wallet address. Please try again later." };
    }
    const evmAddress = evmWallet?.address;
    let ethBalance = '0';
    let usdcBaseBalance = '0';
    if (evmAddress) {
      ethBalance = await getSepoliaEthBalanceViaRpc(evmAddress);
      usdcBaseBalance = await getSepoliaUsdcBalanceViaRpc(evmAddress);
      console.log('[handleGetWalletBalance] ETH:', ethBalance, 'USDC:', usdcBaseBalance);
    } else {
      console.error("[handleGetWalletBalance] No EVM address found for user.");
      return { text: "No wallet address found for your account." };
    }
    const templateData = {
      eth_balance: ethBalance,
      usdc_base_balance: usdcBaseBalance,
      cngn_balance: '0',
    };
    console.log('[handleGetWalletBalance] Sending walletBalance template with:', templateData);
    return walletBalance(templateData);
  } catch (error) {
    console.error("[handleGetWalletBalance] Error:", error);
    return {
      text: 'Sorry, I could not retrieve your wallet balance at this time.',
    };
  }
}

// Helper to get ETH and USDC balance as a string for swap success
async function getWalletBalanceString(address: string): Promise<string> {
  try {
    const ethBalance = await getSepoliaEthBalanceViaRpc(address);
    const usdcBaseBalance = await getSepoliaUsdcBalanceViaRpc(address);
    return `ETH: ${ethBalance}, USDC: ${usdcBaseBalance}`;
  } catch (e) {
    return 'Unavailable';
  }
}

// Handler for swapping tokens using CDP (now handled by handleSwapQuote and handleSwapProcess)
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

// Multi-step send flow support - now uses Privy
async function handleSend(params: ActionParams, userId: string) {
  try {
    console.log(`[handleSend] Processing send request for user ${userId}:`, params);
    const isExecute = params.isExecute === true;
    const token = params.token || 'ETH';
    const amount = params.amount || '';
    const recipient = params.recipient || '';
    const network = params.network || 'base';
    
    console.log(`[handleSend] Token: ${token}, Amount: ${amount}, Recipient: ${recipient}, Network: ${network}, isExecute: ${isExecute}`);
    
    if (!amount || !recipient) {
      console.log(`[handleSend] Missing parameters: amount=${amount}, recipient=${recipient}`);
      return sendFailed({ reason: 'Missing required parameters for sending. Please specify amount and recipient.' });
    }
    
    if (token.toLowerCase() !== 'eth') {
      console.log(`[handleSend] Unsupported token: ${token}`);
      return sendFailed({ reason: 'Currently only ETH transfers are supported. Please try again with ETH.' });
    }
    
    // If this is not an execution request, return the confirmation prompt template
    if (!isExecute) {
      console.log(`[handleSend] Returning send_token_prompt template for confirmation`);
      return sendTokenPrompt({
        amount: amount,
        token: token,
        recipient: formatAddress(recipient),
        network: network,
        fee: '~0.0001 ETH',
        estimatedTime: '30-60 seconds',
      });
    }
    
    // This is an execution request
    console.log(`[handleSend] Executing transaction: ${amount} ${token} to ${recipient} on ${network}`);
    
    try {
      // Execute the transaction
      const txResult = await handleTransaction(userId, params, { ...params, isExecute: true, chain: 'base-sepolia' });
      console.log(`[handleSend] Transaction result:`, txResult);
      
      // Return success template
      const explorerUrl = (txResult && typeof txResult === 'object' && 'explorerUrl' in txResult) ? txResult.explorerUrl : '';
      console.log(`[handleSend] Returning tx_sent_success template with explorerUrl: ${explorerUrl}`);
      
      return txSentSuccess({
        amount: amount,
        token: token,
        recipient: formatAddress(recipient),
        explorerUrl: explorerUrl,
      });
    } catch (sendError: any) {
      console.error(`[handleSend] Error sending transaction:`, sendError);
      return { text: sendError.message || 'Error sending transaction. Please try again later.' };
    }
  } catch (error: any) {
    console.error(`[handleSend] Error:`, error);
    return { text: error.message || 'An unexpected error occurred. Please try again later.' };
  }
}

// Export keys functionality is disabled
// async function handleExportKeys(params: ActionParams, userId: string) {
//   return privateKeys({ privy_link: "https://privy.io/privatekeys" });
// }

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

// Handler for getting a swap quote from BlockRadar API
async function handleSwapQuote(params: ActionParams, userId: string) {
  try {
    console.log(`[Swap] Getting swap quote for user ${userId}, params:`, params);

    // Get wallet address
    const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: '', chain: 'base-sepolia' });
    if (!wallet || !wallet.address) {
      return noWalletYet();
    }

    // Always show the fetching quote message before any prompt
    await supabase.from("messages").insert([{
      user_id: userId,
      content: JSON.stringify({ text: "🔄 Hold on while I fetch the best swap quote for you..." }),
      role: "assistant",
      created_at: new Date().toISOString(),
    }]);

    // Parse params
    const { fromToken, toToken, amount, chain } = params;
    if (!fromToken || !toToken || !amount) {
      // Show a swapPrompt with whatever the user entered, but default to ETH/USDC if missing
      return swapPrompt({
        from_amount: `${amount || ''} ${fromToken ? fromToken.toUpperCase() : 'ETH'}`.trim(),
        to_amount: toToken ? `? ${toToken.toUpperCase()}` : '? USDC',
        fee: '?',
        chain: chain || 'Base',
        est_time: '10s',
      });
    }

    // Normalize token symbols and chain
    const normalizedFromToken = fromToken.toUpperCase();
    const normalizedToToken = toToken.toUpperCase();
    
    // Validate supported tokens
    if (!['ETH', 'USDC'].includes(normalizedFromToken) || !['ETH', 'USDC'].includes(normalizedToToken)) {
      return { text: "Currently only ETH and USDC swaps are supported." };
    }

    // Determine chain (default to base-sepolia if not specified)
    const normalizedChain = (chain || 'base-sepolia').toLowerCase();
    if (!['base', 'base-sepolia'].includes(normalizedChain)) {
      return { text: "Currently only Base network is supported for swaps." };
    }

    // Show pending message first
    await supabase.from("messages").insert([{
      user_id: userId,
      content: JSON.stringify({ text: "🔄 Hold on while I fetch the best swap quote for you..." }),
      role: "assistant",
      created_at: new Date().toISOString(),
    }]);

    // Get quote from BlockRadar API
    const fromAmountInBaseUnit = parseUnits(amount, normalizedFromToken === 'USDC' ? 6 : 18).toString();
    const quoteData = await blockRadar.getSwapQuote({
      fromToken: normalizedFromToken === 'ETH' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      toToken: normalizedToToken === 'ETH' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      fromAmount: fromAmountInBaseUnit,
      walletAddress: wallet.address,
      chainId: normalizedChain === 'base-sepolia' ? 84532 : 8453,
    });

    // Save quote info in session for use in swapProcess
    await supabase.from('sessions').upsert([
      {
        user_id: userId,
        context: [
          {
            role: 'system',
            content: JSON.stringify({
              lastSwapQuote: quoteData,
              lastSwapParams: { fromToken: normalizedFromToken, toToken: normalizedToToken, amount, chain: normalizedChain },
            }),
          },
        ],
        updated_at: new Date().toISOString(),
      },
    ], { onConflict: 'user_id' });


    // Format output amount and fee using BlockRadar API docs
    const toAmountRaw = quoteData.toAmount;
    const toTokenObj = (quoteData.toToken || {}) as { decimals?: number; symbol?: string };
    const toTokenDecimals = typeof toTokenObj.decimals === 'number' ? toTokenObj.decimals : 18;
    const toTokenSymbol = toTokenObj.symbol || '';
    const toAmountFormatted = toAmountRaw ? formatBalance(toAmountRaw, toTokenDecimals) : '0';
    const gasFeeFormatted = quoteData.estimatedGas !== undefined && quoteData.estimatedGas !== null && quoteData.estimatedGas !== '' ? quoteData.estimatedGas : '0';

    // Log all template-bound fields and quoteData for debugging
    console.log('[handleSwapQuote] quoteData:', JSON.stringify(quoteData));
    console.log('[handleSwapQuote] from_amount:', `${amount} ${normalizedFromToken}`);
    console.log('[handleSwapQuote] to_amount:', `${toAmountFormatted} ${toTokenSymbol}`);
    console.log('[handleSwapQuote] fee:', `${gasFeeFormatted} ETH`);
    console.log('[handleSwapQuote] chain:', normalizedChain === 'base-sepolia' ? 'Base Sepolia' : 'Base');
    console.log('[handleSwapQuote] est_time:', '10s');

    return swapPrompt({
      from_amount: `${amount} ${normalizedFromToken}`,
      to_amount: `${toAmountFormatted} ${toTokenSymbol}`,
      fee: `${gasFeeFormatted} ETH`,
      chain: normalizedChain === 'base-sepolia' ? 'Base Sepolia' : 'Base',
      est_time: '10s',
    });
  } catch (error) {
    console.error("[Swap] Error getting swap quote:", error);
    return { text: "Failed to get swap quote. Please try again later." };
  }
}

// Handler for processing a swap using BlockRadar API and Privy wallet
async function handleSwapProcess(params: ActionParams, userId: string) {
  try {
    console.log(`[Swap] Processing swap for user ${userId}`);

    // Get wallet address
    const wallet = await getOrCreatePrivyWallet({ userId, phoneNumber: '', chain: 'base-sepolia' });
    if (!wallet || !wallet.address) {
      return noWalletYet();
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

    // TODO: Integrate new swap execution logic here (BlockRadar or other)
    // Placeholder for txHash, since sendTransaction is removed
    const txHash = "0xPLACEHOLDER_TX_HASH";

    // First send swap success message
    await supabase.from("messages").insert([{
      user_id: userId,
      content: JSON.stringify(swapSuccessful({
        success_message: `Swapped ${lastSwapParams.amount} ${lastSwapParams.fromToken} to ${formatBalance(lastSwapQuote.toAmount, lastSwapParams.toToken === 'USDC' ? 6 : 18)} ${lastSwapParams.toToken}`,
        wallet_balance: await getWalletBalanceString(wallet.address),
        tx_hash: txHash,
      })),
      role: "assistant",
      created_at: new Date().toISOString(),
    }]);

    // Then show deposit notification for received tokens
    return cryptoDepositNotification({
      amount: formatBalance(lastSwapQuote.toAmount, lastSwapParams.toToken === 'USDC' ? 6 : 18),
      token: lastSwapParams.toToken,
      from: 'Swap',
      network: lastSwapParams.chain === 'base-sepolia' ? 'Base Sepolia' : 'Base',
      balance: await getWalletBalanceString(wallet.address),
      txUrl: `https://sepolia.basescan.org/tx/${txHash}`,
    });

  } catch (error) {
    console.error("[Swap] Error processing swap:", error);
    return { text: "Failed to process swap. Please try again later." };
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
