import { loadServerEnvironment } from '../lib/serverEnv';

// Load environment variables first
loadServerEnvironment();

import { getOrCreateCdpWallet, createWallet, getTransaction, getBalances, transferNativeToken, transferToken, estimateTransactionFee, getBlockExplorerUrl } from "../lib/cdp";
import { createClient } from "@supabase/supabase-js";
// Earnings service temporarily removed
import { getTokenPricesBySymbol, TokenPrice } from '../lib/tokenPriceService';
// Proposal service imports removed - using new module system
import { SmartNudgeService } from '../lib/smartNudgeService';
import { InvoiceReminderService } from '../lib/invoiceReminderService';
import { offrampService } from '../services/offrampService';
import { offrampSessionService } from '../services/offrampSessionService';
import { ServerPaycrestService } from '../services/serverPaycrestService';

// Initialize the service
const serverPaycrestService = new ServerPaycrestService();

import fetch from "node-fetch";
import { formatUnits } from "viem";
import { formatAddress, formatBalance } from "../lib/utils";
import { handleCurrencyConversion } from "../lib/currencyConversionService";
import * as crypto from "crypto";

import type { NextApiRequest, NextApiResponse } from "next";
import { formatEther, parseUnits, encodeFunctionData, toHex } from 'viem';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Types
export interface ActionParams {
  [key: string]: any;
  text?: string;
  amount?: string;
  token?: string;
  recipient?: string;
  network?: string;
  from_token?: string;
  to_token?: string;
  swap_state?: string;
  payload?: string;
}

export interface ActionResult {
  text: string;
  metadata?: any;
  reply_markup?: {
    inline_keyboard: Array<Array<{
      text: string;
      callback_data?: string;
      url?: string;
      copy_text?: { text: string };
    }>>;
  };
}

// CDP signing function
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

// Session management
async function updateSession(userId: string, context: any) {
  const { error } = await supabase
    .from('sessions')
    .upsert({
      user_id: userId,
      context: [{ role: 'system', content: JSON.stringify(context) }],
      updated_at: new Date().toISOString()
    });
  
  if (error) {
    console.error('Error updating session:', error);
  }
}

// Helper function to resolve user ID from various formats
async function resolveUserId(userId: string): Promise<string | null> {
  try {
    // Check if userId is already a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      return userId;
    }

    // Handle special web user case
    if (userId === 'web_user_default') {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', 'web_user_default@hedwig.local')
        .single();
      
      if (userError && userError.code === 'PGRST116') {
        // User doesn't exist, create one
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email: 'web_user_default@hedwig.local',
            name: 'Web User',
            phone_number: 'web_default'
          })
          .select('id')
          .single();
        
        if (createError) {
          console.error(`[resolveUserId] Failed to create default user:`, createError);
          return null;
        }
        
        // Automatically create wallets for the new web user
        try {
          console.log(`[resolveUserId] Creating wallets for new web user...`);
          
          // Create EVM wallet
          const evmWallet = await createWallet(newUser.id, 'evm');
          console.log(`[resolveUserId] EVM wallet created for web user: ${evmWallet.address}`);
          
          // Create Solana wallet
          const solanaWallet = await createWallet(newUser.id, 'solana');
          console.log(`[resolveUserId] Solana wallet created for web user: ${solanaWallet.address}`);
          
          console.log(`[resolveUserId] Successfully created web user with wallets`);
        } catch (walletError) {
          console.error(`[resolveUserId] Failed to create wallets for web user:`, walletError);
          // Don't fail user creation if wallet creation fails - wallets can be created later
        }
        
        return newUser.id;
      } else if (userError) {
        console.error(`[resolveUserId] Failed to find user:`, userError);
        return null;
      } else {
        return user.id;
      }
    }

    // Try to find by email first
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userId)
      .single();
    
    if (user) {
      return user.id;
    }

    // If not found by email, try by phone_number
    ({ data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', userId)
      .single());
    
    if (user) {
      return user.id;
    }

    // If not found by email or phone, try by telegram_chat_id
    ({ data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', userId)
      .single());
    
    if (user) {
      console.log(`[resolveUserId] Found existing user by telegram_chat_id ${userId}:`, user.id);
      return user.id;
    }

    // If user not found by any method, log error and return null
    console.error(`[resolveUserId] User ${userId} not found in database. Offramp should only work with existing users.`);
    return null;
  } catch (error) {
    console.error('[resolveUserId] Error:', error);
    return null;
  }
}

// Helper function to get user wallet addresses
async function getUserWalletAddresses(userId: string): Promise<string[]> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return [];
    }

    const { data: wallets } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", actualUserId);

    return wallets ? wallets.map(w => w.address) : [];
  } catch (error) {
    console.error('[getUserWalletAddresses] Error:', error);
    return [];
  }
}

// Wallet creation function
async function handleCreateWallets(userId: string) {
  try {
    console.log(`[handleCreateWallets] Creating wallets for user: ${userId}`);
    
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }

    // Create EVM wallet
    const evmWallet = await createWallet(actualUserId, 'evm');
    console.log(`[handleCreateWallets] EVM wallet created:`, evmWallet);

    // Create Solana wallet
    const solanaWallet = await createWallet(actualUserId, 'solana');
    console.log(`[handleCreateWallets] Solana wallet created:`, solanaWallet);

    return {
      text: `🎉 **Wallets Created Successfully!**\n\n` +
            `✅ **EVM Wallet**: ${evmWallet.address}\n` +
            `✅ **Solana Wallet**: ${solanaWallet.address}\n\n` +
            `Your wallets are now ready to use!\n\n` +
            `You can send crypto or create payment links right away.\n\n` +
            `🔒 Your wallets are secured by Coinbase's infrastructure.`
    };
  } catch (error) {
    console.error('[handleCreateWallets] Error:', error);
    return {
      text: "❌ Failed to create wallets. Please try again later or contact support."
    };
  }
}

async function handleGetWalletBalance(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }

    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);

    if (!wallets || wallets.length === 0) {
      return {
        text: "Your wallet is being set up automatically. Please try again in a moment."
      };
    }

    // Check if user requested specific network
    const requestedNetwork = params?.parameters?.network?.toLowerCase();
    
    // Map specific chains to their categories
    const evmChains = ['evm', 'base', 'ethereum', 'optimism', 'celo', 'polygon', 'arbitrum'];
    const isEvmRequest = requestedNetwork && evmChains.includes(requestedNetwork);
    const isSolanaRequest = requestedNetwork === 'solana';
    const isSpecificChainRequest = requestedNetwork && (evmChains.includes(requestedNetwork) || requestedNetwork === 'solana');

    let evmBalances = "";
    let solanaBalances = "";
    let response = "";

    // Get EVM wallet
    const evmWallet = wallets.find(w => w.chain === 'evm');
    if (evmWallet && (!isSpecificChainRequest || isEvmRequest)) {
      try {
        // Get balances for mainnet networks (base mainnet only - Ethereum disabled)
        const supportedEvmNetworks = ['base'];
        let allEvmBalances = "";

        // Get token prices for USD conversion
        let tokenPrices: any = {};
        try {
          const prices = await getTokenPricesBySymbol(['ETH', 'USDC']);
          tokenPrices = prices.reduce((acc: any, price: any) => {
            acc[price.symbol] = price.price;
            return acc;
          }, {});
        } catch (priceError) {
          console.warn('[handleGetWalletBalance] Failed to fetch token prices:', priceError);
        }

        // If specific EVM chain requested, filter to that chain
        let networksToCheck = supportedEvmNetworks;
        if (requestedNetwork && requestedNetwork !== 'evm') {
          const chainMap: { [key: string]: string } = {
            'base': 'base'
          };
          const specificNetwork = chainMap[requestedNetwork];
          if (specificNetwork) {
            networksToCheck = [specificNetwork];
          }
        }

        for (const network of networksToCheck) {
          try {
            const balances = await getBalances(evmWallet.address, network);
            
            // Handle different return types from getBalances
            let ethBalance = '0';
            let usdcBalance = '0';
            
            if (Array.isArray(balances)) {
              // Solana format or processed EVM format
              const ethToken = balances.find((b: any) => b.asset?.symbol === 'ETH' || b.symbol === 'ETH');
              const usdcToken = balances.find((b: any) => b.asset?.symbol === 'USDC' || b.symbol === 'USDC');
              
              ethBalance = (ethToken as any)?.balance || (ethToken as any)?.amount || '0';
              usdcBalance = (usdcToken as any)?.balance || (usdcToken as any)?.amount || '0';
            } else if (balances && typeof balances === 'object' && 'data' in balances) {
              // EVM ListTokenBalancesResult format (from CDP or Alchemy)
              const balanceArray = (balances as any).data || [];
              const ethToken = balanceArray.find((b: any) => b.asset?.symbol === 'ETH');
              const usdcToken = balanceArray.find((b: any) => b.asset?.symbol === 'USDC');
              
              ethBalance = ethToken ? formatBalance(ethToken.amount, ethToken.asset.decimals) : '0';
              usdcBalance = usdcToken ? formatBalance(usdcToken.amount, usdcToken.asset.decimals) : '0';
            }
            
            const networkName = network.replace('-sepolia', '').replace('-alfajores', '');
            const displayName = networkName.charAt(0).toUpperCase() + networkName.slice(1);
            
            // Format balances with USD equivalents
            const ethBalanceNum = parseFloat(ethBalance);
            const usdcBalanceNum = parseFloat(usdcBalance);
            
            let ethDisplay = `${ethBalanceNum.toFixed(4)} ETH`;
            let usdcDisplay = `${usdcBalanceNum.toFixed(2)} USDC`;
            
            if (tokenPrices.ETH && ethBalanceNum > 0) {
              const ethUsd = (ethBalanceNum * tokenPrices.ETH).toFixed(2);
              ethDisplay += ` ($${ethUsd})`;
            }
            
            if (tokenPrices.USDC && usdcBalanceNum > 0) {
              const usdcUsd = (usdcBalanceNum * tokenPrices.USDC).toFixed(2);
              usdcDisplay += ` ($${usdcUsd})`;
            }
            
            allEvmBalances += `🔹 **${displayName}**\n`;
            allEvmBalances += `• ${ethDisplay}\n`;
            allEvmBalances += `• ${usdcDisplay}\n\n`;
          } catch (networkError) {
            console.error(`[handleGetWalletBalance] Error fetching ${network} balances:`, networkError);
            const networkName = network.replace('-sepolia', '').replace('-alfajores', '');
            const displayName = networkName.charAt(0).toUpperCase() + networkName.slice(1);
            allEvmBalances += `🔹 **${displayName}**\n• Error fetching balances\n\n`;
          }
        }

        evmBalances = `💰 **Here are your balances**\n${allEvmBalances}`;
      } catch (balanceError) {
        console.error(`[handleGetWalletBalance] Error fetching EVM balances:`, balanceError);
        evmBalances = `💰 **Here are your balances**\n• Error fetching balances\n\n`;
      }
    }

    // Get Solana wallet
    const solanaWallet = wallets.find(w => w.chain === 'solana');
    if (solanaWallet && (!isSpecificChainRequest || isSolanaRequest)) {
      try {
        const balances = await getBalances(solanaWallet.address, 'solana');
        
        let solAmount = '0';
        let usdcAmount = '0';
        
        let usdtAmount = '0';
        
        if (Array.isArray(balances)) {
          // New format from getSolanaBalances function
          const solToken = balances.find((b: any) => b.asset?.symbol === 'SOL');
          const usdcToken = balances.find((b: any) => b.asset?.symbol === 'USDC');
          const usdtToken = balances.find((b: any) => b.asset?.symbol === 'USDT');
          
          if (solToken) {
            // SOL balance is already in lamports, convert to SOL
            solAmount = formatBalance(solToken.amount, solToken.asset.decimals);
          }
          
          if (usdcToken) {
            // USDC balance from SPL token
            usdcAmount = formatBalance(usdcToken.amount, usdcToken.asset.decimals);
          }
          
          if (usdtToken) {
            // USDT balance from SPL token
            usdtAmount = formatBalance(usdtToken.amount, usdtToken.asset.decimals);
          }
        }
        
        // Get token prices for USD conversion
        let tokenPrices: any = {};
        try {
          const prices = await getTokenPricesBySymbol(['SOL', 'USDC', 'USDT']);
          tokenPrices = prices.reduce((acc: any, price: any) => {
            acc[price.symbol] = price.price;
            return acc;
          }, {});
        } catch (priceError) {
          console.warn('[handleGetWalletBalance] Failed to fetch Solana token prices:', priceError);
        }
        
        // Format balances with USD equivalents
        const solBalanceNum = parseFloat(solAmount);
        const usdcBalanceNum = parseFloat(usdcAmount);
        const usdtBalanceNum = parseFloat(usdtAmount);
        
        let solDisplay = `${solBalanceNum.toFixed(4)} SOL`;
        let usdcDisplay = `${usdcBalanceNum.toFixed(2)} USDC`;
        let usdtDisplay = `${usdtBalanceNum.toFixed(2)} USDT`;
        
        if (tokenPrices.SOL && solBalanceNum > 0) {
          const solUsd = (solBalanceNum * tokenPrices.SOL).toFixed(2);
          solDisplay += ` ($${solUsd})`;
        }
        
        if (tokenPrices.USDC && usdcBalanceNum > 0) {
          const usdcUsd = (usdcBalanceNum * tokenPrices.USDC).toFixed(2);
          usdcDisplay += ` ($${usdcUsd})`;
        }
        
        if (tokenPrices.USDT && usdtBalanceNum > 0) {
          const usdtUsd = (usdtBalanceNum * tokenPrices.USDT).toFixed(2);
          usdtDisplay += ` ($${usdtUsd})`;
        }
        
        solanaBalances = `🌸 **Solana**\n• ${usdcDisplay}\n• ${usdtDisplay}\n• ${solDisplay}\n\n`;
      } catch (balanceError) {
        console.error(`[handleGetWalletBalance] Error fetching Solana balances:`, balanceError);
        solanaBalances = `🌸 **Solana**\n• Error fetching USDC\n• Error fetching USDT\n• Error fetching SOL\n\n`;
      }
    }

    // Format response based on context
    if (isSolanaRequest) {
      response = solanaBalances || "❌ No Solana wallet found.";
    } else if (isEvmRequest) {
      response = evmBalances || "❌ No EVM wallet found.";
    } else {
      // Show all balances for general requests
      if (!evmBalances && !solanaBalances) {
        response = "Your wallets are being set up automatically. Please try again in a moment.";
      } else {
        response = `${evmBalances || ""}${solanaBalances || ""}Let me know if you'd like to send tokens or refresh your balances.`;
      }
    }

    // Ensure response is never empty
    if (!response || response.trim() === "") {
      response = "❌ Unable to fetch wallet balances. Please try again later.";
    }

    return { 
      text: response,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Refresh", callback_data: "refresh_balances" },
            { text: "📤 Send", callback_data: "start_send_token_flow" }
          ]
        ]
      }
    };
  } catch (error) {
    console.error('[handleGetWalletBalance] Error:', error);
    return {
      text: "❌ Failed to fetch wallet balances. Please try again later."
    };
  }
}

async function handleGetWalletAddress(userId: string, params?: ActionParams): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }
    
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);

    if (!wallets || wallets.length === 0) {
      return {
        text: "Your wallets are being set up automatically. Please try again in a moment."
      };
    }

    // Check if user requested specific network
    const requestedNetwork = params?.parameters?.network?.toLowerCase();

    let evmAddress = "";
    let solanaAddress = "";

    wallets.forEach(wallet => {
      if (wallet.chain === 'evm') {
        evmAddress = wallet.address;
      } else if (wallet.chain === 'solana') {
        solanaAddress = wallet.address;
      }
    });

    // Context-aware response
    if (requestedNetwork === 'solana') {
      if (!solanaAddress) {
        return { 
          text: "❌ No Solana wallet found.\n\n🎯 **Create Solana Wallet:**\nType: 'Create Solana wallet'",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🌸 Create Solana Wallet", callback_data: "create_solana_wallet" }]
            ]
          }
        };
      }
      return { 
        text: `✅ **Your Solana Wallet**\n\n🌸 **Address:**\n\`${solanaAddress}\`\n\n💡 Use this address to receive SOL, USDC, and other SPL tokens on Solana network.\n\n🔒 Keep this address safe and share it only when receiving payments.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Copy Solana Address", copy_text: { text: solanaAddress } }]
          ]
        }
      };
    } else if (requestedNetwork === 'evm' || requestedNetwork === 'base') {
      if (!evmAddress) {
        return { 
          text: "❌ No EVM wallet found.\n\n🎯 **Create EVM Wallet:**\nType: 'Create EVM wallet'",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🟦 Create EVM Wallet", callback_data: "create_evm_wallet" }]
            ]
          }
        };
      }
      return { 
        text: `✅ **Your Base Wallet**\n\n🟦 **Address:**\n\`${evmAddress}\`\n\n💡 Use this address to receive ETH, USDC, and other tokens on Base network.\n\n🔒 Keep this address safe and share it only when receiving payments.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Copy Base Address", copy_text: { text: evmAddress } }]
          ]
        }
      };
    } else {
      // Show both addresses if they exist
      let responseText = "✅ **Your Wallet Addresses**\n\n";
      let buttons: Array<{ text: string; copy_text?: { text: string }; callback_data?: string }> = [];

      if (evmAddress) {
        responseText += `🟦 **Base Network:**\n\`${evmAddress}\`\n\n`;
        buttons.push({ text: "📋 Copy Base", copy_text: { text: evmAddress } });
      }

      if (solanaAddress) {
        responseText += `🌸 **Solana Network:**\n\`${solanaAddress}\`\n\n`;
        buttons.push({ text: "📋 Copy Solana", copy_text: { text: solanaAddress } });
      }

      responseText += "💡 Use these addresses to receive deposits on their respective networks.\n\n🔒 Keep these addresses safe and share them only when receiving payments.";

      // If no wallets exist, wallets will be created automatically
      if (!evmAddress && !solanaAddress) {
        return { 
          text: "Your wallets are being set up automatically. Please try again in a moment."
        };
      }

      // If only one wallet exists, offer to create the missing one
      if (!evmAddress) {
        buttons.push({ text: "➕ Create Base Wallet", callback_data: "create_evm_wallet" });
      }
      if (!solanaAddress) {
        buttons.push({ text: "➕ Create Solana Wallet", callback_data: "create_solana_wallet" });
      }

      return { 
        text: responseText,
        reply_markup: {
          inline_keyboard: buttons.length > 0 ? [buttons] : []
        }
      };
    }
  } catch (error) {
    console.error('[handleGetWalletAddress] Error:', error);
    return {
      text: "❌ Failed to fetch wallet addresses. Please try again later."
    };
  }
}

// Main action handler
export async function handleAction(
  intent: string,
  params: ActionParams,
  userId: string,
): Promise<ActionResult> {
  console.log("[handleAction] Intent:", intent, "Params:", params, "UserId:", userId);

  // Text-based balance intent matching (but not during active offramp sessions)
  if (params.text && typeof params.text === 'string') {
    const text = params.text.toLowerCase();
    if (text.includes('balance') || text.includes('wallet balance')) {
      // Check if user has an active offramp session
      const actualUserId = await resolveUserId(userId);
      if (actualUserId) {
        const activeSession = await offrampSessionService.getActiveSession(actualUserId);
        if (!activeSession) {
          return await handleGetWalletBalance(params, userId);
        }
        // If there's an active offramp session, route to offramp handler
        return await handleOfframp(params, actualUserId);
      } else {
        return await handleGetWalletBalance(params, userId);
      }
    }
  }

  // Special case for clarification intent
  if (intent === "clarification" || intent === "unknown") {
    return {
      text: "I didn't understand your request. You can ask about checking balance, sending crypto, or getting crypto prices.",
    };
  }

  // For blockchain-related intents, verify wallet first
  const blockchainIntents = [
    "get_wallet_balance",
    "get_wallet_address", 
    "send",
    "swap",
    "bridge",
    "create_payment_link",
  ];

  if (blockchainIntents.includes(intent)) {
    try {
      const actualUserId = await resolveUserId(userId);
      if (!actualUserId) {
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      const { data: wallets } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", actualUserId);
      
      const hasEvm = wallets?.some((w) => w.chain === "evm");
      const hasSolana = wallets?.some((w) => w.chain === "solana");
      
      if (!hasEvm && !hasSolana) {
        return {
          text: "Your wallet is being set up automatically. Please try again in a moment.",
        };
      }
    } catch (error) {
      console.error("Error checking wallet:", error);
      return {
        text: "An error occurred while checking your wallet status. Please try again later.",
      };
    }
  }

  // Disabled features
  if (intent === "get_price" || intent === "currency_conversion" || intent === "exchange_rate") {
    return {
      text: "🚧 **Currency conversion feature is currently disabled.**\n\nThis feature has been temporarily removed. Please use external tools for currency conversion needs.",
    };
  }

  if (intent === "get_news") {
    return {
      text: "News updates are currently unavailable. This feature will be enabled soon.",
    };
  }

  // Special handling for create_wallets intent
  if (intent === "create_wallets" || intent === "CREATE_WALLET" ||
      intent === "create_wallet" || intent === "CREATE_WALLETS" ||
      params.payload === "create_wallets" || params.payload === "CREATE_WALLET") {
    return await handleCreateWallets(userId);
  }

  // Check if user has wallets for balance-related commands
  const actualUserId = await resolveUserId(userId);
  if (actualUserId && (intent === "balance" || intent === "show_balance" || intent === "wallet" || 
                       intent === "wallet_balance" || intent === "get_wallet_balance" ||
                       intent === "instruction_deposit" || intent === "get_wallet_address")) {
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);

    const hasEvm = wallets?.some((w) => w.chain === "evm");
    const hasSolana = wallets?.some((w) => w.chain === "solana");

    if (!hasEvm && !hasSolana) {
      // Automatically create wallets for the user
      console.log(`[handleAction] No wallets found for user ${userId}, creating automatically...`);
      
      try {
        // Create wallets in the background
        const evmWallet = await createWallet(actualUserId, 'evm');
        const solanaWallet = await createWallet(actualUserId, 'solana');
        
        return {
          text: "🎉 **Welcome! I've created your wallets automatically.**\n\n" +
                `✅ **EVM Wallet**: ${evmWallet.address}\n` +
                `✅ **Solana Wallet**: ${solanaWallet.address}\n\n` +
                `Your wallets are now ready! Please try your command again.`
        };
      } catch (error) {
        console.error('[handleAction] Failed to auto-create wallets:', error);
        return {
          text: "Your wallet is being set up automatically. Please try again in a moment, or type 'create wallet' to manually create your wallets.",
        };
      }
    }
  }

  // Handle core intents
  switch (intent) {
    case "create_wallet":
    case "create_wallets":
    case "CREATE_WALLET":
    case "CREATE_WALLETS":
      return await handleCreateWallets(userId);

    case "balance":
    case "show_balance":
    case "wallet":
    case "wallet_balance":
    case "get_wallet_balance":
      return await handleGetWalletBalance(params, userId);
    
    case "instruction_deposit":
    case "get_wallet_address":
      return await handleGetWalletAddress(userId, params);
    
    case "instruction_send":
    case "send":
      return await handleSend(params, userId);
    
    case "swap":
      return await handleSwap(params, userId);
    
    case "create_payment_link":
      return await handleCreatePaymentLink(params, userId);
    
    case "create_invoice":
      return await handleCreateInvoice(params, userId);
    
    case "create_proposal":
      return await handleCreateProposal(params, userId);
    
    case "offramp":
    case "withdraw":
    case "withdrawal":
      return await handleOfframp(params, userId);

    case "offramp_callback":
      // Handle offramp callback actions (like confirm, cancel, etc.)
      if (params.callbackData === 'offramp_confirm') {
        return await handleOfframpSubmit(params, userId);
      } else {
        // For other callback data, route to main offramp handler
        return await handleOfframp(params, userId);
      }

    case "offramp_submit":
      return handleOfframpSubmit(params, userId);

    
    
    case "earnings":
    case "get_earnings":
    case "earnings_summary":
    case "show_earnings_summary":
      try {
        // Get user's wallet addresses
        const walletAddresses = await getUserWalletAddresses(userId);
        if (!walletAddresses || walletAddresses.length === 0) {
          return { text: "Your wallet is being set up automatically. Please try again in a moment." };
        }

        // Use the first wallet address for earnings summary
        const walletAddress = walletAddresses[0];
        
        // Import earnings service functions dynamically
        const { parseEarningsQuery } = await import('../lib/earningsService');
        
        // Parse natural language query if text is provided
        let parsedFilter: any = null;
        if (params.text) {
          parsedFilter = parseEarningsQuery(params.text);
        }
        
        // Extract parameters for filtering, prioritizing parsed natural language
        const filter = {
          walletAddress,
          timeframe: parsedFilter?.timeframe || params.timeframe || 'allTime',
          token: parsedFilter?.token || params.token,
          network: parsedFilter?.network || params.network,
          startDate: parsedFilter?.startDate || params.startDate,
          endDate: parsedFilter?.endDate || params.endDate
        };

        // Import earnings service functions dynamically
        const { getEarningsSummary, formatEarningsForAgent } = await import('../lib/earningsService');
        
        const summary = await getEarningsSummary(filter, true); // Include insights
        if (summary && summary.totalPayments > 0) {
          const formatted = formatEarningsForAgent(summary, 'earnings');
          return { 
            text: formatted,
            reply_markup: {
              inline_keyboard: [[
                { text: "📄 Generate PDF Report", callback_data: "generate_earnings_pdf" }
              ]]
            }
          };
        } else {
          return { text: "💰 **Earnings Summary**\n\nYour earnings tracking is ready! Start receiving payments to see detailed analytics.\n\n💡 **Ways to earn:**\n• Create payment links with `create payment link`\n• Generate invoices with `create invoice`\n• Send your wallet address to receive direct transfers\n\n📊 **What you'll see:**\n• Total earnings by token\n• Monthly breakdown\n• Top payment sources\n• Conversion rates\n\nCreate your first payment method to start tracking!" };
        }
      } catch (error) {
        console.error('[handleAction] Earnings error:', error);
        return { text: "❌ Failed to fetch earnings data. Please try again later." };
      }

    case "generate_earnings_pdf":
    case "earnings_pdf":
      try {
        // Get user's wallet addresses
        const walletAddresses = await getUserWalletAddresses(userId);
        if (!walletAddresses || walletAddresses.length === 0) {
          return { text: "Your wallet is being set up automatically. Please try again in a moment." };
        }

        // Use the first wallet address for earnings summary
        const walletAddress = walletAddresses[0];
        
        // Extract parameters for filtering
        const filter = {
          walletAddress,
          timeframe: params.timeframe || 'allTime',
          token: params.token,
          network: params.network,
          startDate: params.startDate,
          endDate: params.endDate
        };

        // Import earnings service functions dynamically
        const { getEarningsSummary } = await import('../lib/earningsService');
        const { generateEarningsPDF } = await import('../modules/pdf-generator-earnings');
        
        // Get user data for dynamic PDF content
        const actualUserId = await resolveUserId(userId);
        let userData: { name: any; telegram_first_name: any; telegram_last_name: any; telegram_username: any; } | null = null;
        if (actualUserId) {
          const { data } = await supabase
            .from('users')
            .select('name, telegram_first_name, telegram_last_name, telegram_username')
            .eq('id', actualUserId)
            .single();
          userData = data;
        }
        
        const summary = await getEarningsSummary(filter, true); // Include insights
        if (summary && summary.totalPayments > 0) {
          // Transform summary data for PDF generation
          const earningsData = {
            walletAddress: summary.walletAddress || 'N/A',
            timeframe: summary.timeframe,
            totalEarnings: summary.totalEarnings,
            totalFiatValue: summary.totalFiatValue,
            totalPayments: summary.totalPayments,
            earnings: summary.earnings,
            period: summary.period,
            insights: summary.insights ? {
              largestPayment: summary.insights.largestPayment,
              topToken: summary.insights.topToken,
              motivationalMessage: summary.insights.motivationalMessage
            } : undefined,
            userData: userData ? {
              name: userData.name,
              telegramFirstName: userData.telegram_first_name,
              telegramLastName: userData.telegram_last_name,
              telegramUsername: userData.telegram_username
            } : undefined
          };

          // Generate PDF
          const pdfBuffer = await generateEarningsPDF(earningsData);
          
          // For now, return success message with file info
          // In a real implementation, you'd upload to storage and provide download link
          return { 
            text: "📄 **PDF Report Generated Successfully!**\n\n" +
                  "🎨 Your creative earnings summary has been generated with:\n" +
                  "• Visual charts and insights\n" +
                  "• Motivational content\n" +
                  "• Professional formatting\n" +
                  "• Transaction breakdown\n\n" +
                  `📊 Report covers: ${earningsData.timeframe}\n` +
                  `💰 Total earnings: ${earningsData.totalEarnings} tokens\n` +
                  `📈 Payments: ${earningsData.totalPayments}\n\n` +
                  "💡 The PDF contains creative elements like emojis, color coding, and motivational messages to make your financial data engaging!"
          };
        } else {
          return { text: "📄 **No Data for PDF Generation**\n\nYou need some earnings data to generate a PDF report. Start receiving payments first!\n\n💡 Create payment links or invoices to begin tracking your earnings." };
        }
      } catch (error) {
        console.error('[handleAction] PDF generation error:', error);
        return { text: "❌ Failed to generate PDF report. Please try again later." };
      }

    case "business_dashboard":
    case "show_business_dashboard":
      try {
        // Get user info for dashboard
        const actualUserId = await resolveUserId(userId);
        if (!actualUserId) {
          return {
            text: "❌ User not found. Please make sure you're registered with the bot.",
          };
        }

        // Get business overview data
        const { data: proposals } = await supabase
          .from('proposals')
          .select('id, status, total_amount, currency')
          .eq('user_id', actualUserId);

        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, status, total_amount, currency')
          .eq('user_id', actualUserId);

        const { data: paymentLinks } = await supabase
          .from('payment_links')
          .select('id, status, amount, token')
          .eq('user_id', actualUserId);

        // Calculate summary stats
        const proposalCount = proposals?.length || 0;
        const invoiceCount = invoices?.length || 0;
        const paymentLinkCount = paymentLinks?.length || 0;

        const pendingProposals = proposals?.filter(p => p.status === 'pending')?.length || 0;
        const pendingInvoices = invoices?.filter(i => i.status === 'pending')?.length || 0;
        const activePaymentLinks = paymentLinks?.filter(pl => pl.status === 'active')?.length || 0;

        return {
          text: `📊 **Business Dashboard**\n\n` +
                `**Overview:**\n` +
                `📋 Proposals: ${proposalCount} total (${pendingProposals} pending)\n` +
                `📄 Invoices: ${invoiceCount} total (${pendingInvoices} pending)\n` +
                `🔗 Payment Links: ${paymentLinkCount} total (${activePaymentLinks} active)\n\n` +
                `**Quick Actions:**\n` +
                `• Type "create proposal" to generate a new proposal\n` +
                `• Type "create invoice" to create a new invoice\n` +
                `• Type "create payment link" to generate a payment link\n` +
                `• Type "show earnings" to view your earnings summary\n\n` +
                `**Recent Activity:**\n` +
                `Use the Telegram bot interface for detailed management and interactive dashboard.`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📋 Create Proposal", callback_data: "create_proposal_flow" },
                { text: "📄 Create Invoice", callback_data: "create_invoice_flow" }
              ],
              [
                { text: "🔗 Payment Link", callback_data: "create_payment_link_flow" },
                { text: "💰 Earnings", callback_data: "view_earnings" }
              ]
            ]
          }
        };
      } catch (error) {
        console.error('[handleAction] Business dashboard error:', error);
        return { text: "❌ Failed to load business dashboard. Please try again later." };
      }

    case "get_spending":
      try {
        // Get user's wallet addresses
        const walletAddresses = await getUserWalletAddresses(userId);
        if (!walletAddresses || walletAddresses.length === 0) {
          return { text: "Your wallet is being set up automatically. Please try again in a moment." };
        }

        // Use the first wallet address for spending summary
        const walletAddress = walletAddresses[0];
        
        // Extract parameters for filtering
        const filter = {
          walletAddress,
          timeframe: params.timeframe || 'allTime',
          token: params.token,
          network: params.network,
          startDate: params.startDate,
          endDate: params.endDate
        };

        // const summary = await getSpendingSummary(filter);
        // if (summary && summary.totalPayments > 0) {
        //   const formatted = formatEarningsForAgent(summary, 'spending');
        //   return { text: formatted };
        // } else {
          return { text: "💸 Spending feature temporarily unavailable. Your crypto is safe in your wallet!\n\n💡 Tip: Use the 'send' command to transfer crypto to others." };
        // }
      } catch (error) {
        console.error('[handleAction] Spending error:', error);
        return { text: "❌ Failed to fetch spending data. Please try again later." };
      }

    case "offramp":
    case "withdraw":
      return await handleOfframp(params, userId);

    case "kyc_verification":
      return await handleKYCVerification(params, userId);

    case "offramp_history":
      return await handleOfframpHistory(params, userId);

    case "retry_transaction":
      return await handleRetryTransaction(params, userId);

    case "cancel_transaction":
      return await handleCancelTransaction(params, userId);

    case "transaction_status":
      return await handleTransactionStatus(params, userId);
    
    case "send_reminder":
      return await sendManualReminder(userId, params);
    
    case "list_paid_items":
      try {
        const actualUserId = await resolveUserId(userId);
        if (!actualUserId) {
          return {
            text: "❌ User not found. Please make sure you're registered with the bot.",
          };
        }

        const paidItems = await SmartNudgeService.getUserPaidItems(actualUserId);
        const totalPaid = paidItems.paymentLinks.length + paidItems.invoices.length;
        
        if (totalPaid === 0) {
          return {
            text: "📭 You have no paid payment links or invoices yet.\n\n💡 **Tip:** Once clients pay your invoices or payment links, they'll appear here for tracking."
          };
        }

        let paidList = `✅ **Paid Items Summary** (${totalPaid} total)\n\n`;
        
        if (paidItems.paymentLinks.length > 0) {
          paidList += `💳 **Payment Links (${paidItems.paymentLinks.length}):**\n`;
          paidItems.paymentLinks.forEach((item, index) => {
            const paidDate = new Date(item.paidAt).toLocaleDateString();
            paidList += `${index + 1}. ${item.title} - $${item.amount}\n   📧 ${item.clientEmail}\n   💰 Paid: ${paidDate}\n\n`;
          });
        }
        
        if (paidItems.invoices.length > 0) {
          paidList += `📄 **Invoices (${paidItems.invoices.length}):**\n`;
          paidItems.invoices.forEach((item, index) => {
            const paidInfo = item.paidAt ? ` - Paid: ${new Date(item.paidAt).toLocaleDateString()}` : '';
            paidList += `${index + 1}. ${item.title} - $${item.amount}\n   📧 ${item.clientEmail}${paidInfo}\n\n`;
          });
        }

        return {
          text: paidList
        };
      } catch (error) {
        console.error('[handleAction] List paid items error:', error);
        return { text: "❌ Failed to fetch paid items. Please try again later." };
      }
    
    case "help":
      return {
        text: "🦉 **Hedwig Help**\n\n" +
              "Available commands:\n" +
              "• `create wallet` - Create new wallets\n" +
              "• `balance` - Check wallet balances\n" +
              "• `address` - Get wallet addresses\n" +
              "• `send` - Send crypto to others\n" +
              "• `earnings` - View earnings summary\n" +
              "• `create payment link` - Create payment links\n" +
              "• `help` - Show this help message\n\n" +
              "More features coming soon!"
      };
    
    case "welcome":
      return {
        text: "🦉 **Hi, I'm Hedwig!**\n\n" +
              "I'm your freelance assistant. I can help you:\n\n" +
              "💰 **Check wallet balances** - Just ask \"what's my balance?\"\n" +
              "📍 **Get wallet addresses** - Ask \"show my wallet address\"\n" +
              "💸 **Send crypto** - Say \"send 0.1 ETH to [address]\"\n" +
              "🔗 **Create payment links** - Request \"create payment link for 50 USDC\"\n" +
              "📊 **View earnings** - Ask \"show my earnings\"\n" +
              "📄 **Create invoices** - Say \"create invoice\"\n" +
              "📋 **Make proposals** - Request \"create proposal\"\n\n" +
              "What would you like to do today?"
      };
    
    default:
      return {
        text: "I didn't understand that command. Type 'help' to see available commands.",
      };
  }
}

// Alchemy webhook handler (placeholder)
export async function handleAlchemyWebhook(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('[Alchemy Webhook] Received webhook:', req.method, req.body);
    
    // TODO: Implement Alchemy webhook processing
    // This is a placeholder for future Alchemy integration
    
    res.status(200).json({ 
      success: true, 
      message: 'Alchemy webhook received (not implemented)' 
    });
  } catch (error) {
    console.error('[Alchemy Webhook] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

async function handleSend(params: ActionParams, userId: string) {
  try {
    // Determine if userId is a UUID or username and get the actual user UUID
    let actualUserId: string;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      actualUserId = userId;
    } else {
      // userId is a username, fetch the actual UUID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[handleSend] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      actualUserId = user.id;
    }

    // Get user wallets
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);

    if (!wallets || wallets.length === 0) {
      return {
        text: "Your wallet is being set up automatically. Please try again in a moment."
      };
    }

    // Extract parameters from the request
    const { amount, token, to_address, recipient, network, confirm } = params;
    const recipientAddress = to_address || recipient;

    // Check if this is a confirmation request
    if (confirm === 'yes' || confirm === 'true' || params.action === 'confirm_send') {
      // User is confirming the transaction - execute it
      if (!amount || !recipientAddress) {
        return {
          text: "❌ Missing transaction details. Please start the send process again."
        };
      }

      // Function to detect if an address is a Solana address
      const isSolanaAddress = (address: string): boolean => {
        // Solana addresses are 32-44 characters long and use base58 encoding
        // They typically don't contain 0, O, I, or l characters
        const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        return solanaAddressRegex.test(address) && address.length >= 32 && address.length <= 44;
      };

      // Determine which wallet to use based on token/network/recipient address
      let selectedWallet;
      let selectedNetwork;
      
      if (token?.toLowerCase() === 'sol' || 
          network?.toLowerCase() === 'solana' || 
          isSolanaAddress(recipientAddress)) {
        selectedWallet = wallets.find(w => w.chain === 'solana');
        selectedNetwork = 'solana';
      } else {
        // Default to EVM for ETH, USDC, etc.
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'evm';
      }

      if (!selectedWallet) {
        return {
          text: `❌ You don't have a ${selectedNetwork === 'solana' ? 'Solana' : 'Base'} wallet. Please create one first.`
        };
      }

      try {
        let result;
        const fromAddress = selectedWallet.address;
        
        // Determine if this is a native token transfer or token transfer
        const isNativeToken = (
          (selectedNetwork === 'evm' && (!token || token.toLowerCase() === 'eth')) ||
          (selectedNetwork === 'solana' && (!token || token.toLowerCase() === 'sol'))
        );

        if (isNativeToken) {
          // Native token transfer using CDP API <mcreference link="https://docs.cdp.coinbase.com/wallet-api/v2/using-the-wallet-api/transfers" index="1">1</mcreference>
          result = await transferNativeToken(
            fromAddress,
            recipientAddress,
            amount,
            selectedNetwork === 'evm' ? 'base' : 'solana'
          );
        } else {
          // Token transfer using CDP API <mcreference link="https://docs.cdp.coinbase.com/wallet-api/v2/evm-features/sending-transactions" index="2">2</mcreference>
          let tokenAddress;
          if (token?.toLowerCase() === 'usdc') {
            // Use appropriate USDC contract address based on network
            if (selectedNetwork === 'evm') {
              tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC
            } else {
              tokenAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Solana Mainnet USDC
            }
          } else {
            return {
              text: `❌ Unsupported token: ${token}. Supported tokens: ETH, USDC, SOL`
            };
          }

          result = await transferToken(
            fromAddress,
            recipientAddress,
            tokenAddress,
            amount,
            selectedNetwork === 'evm' ? 6 : 6, // USDC has 6 decimals
            selectedNetwork === 'evm' ? 'base' : 'solana'
          );
        }

        // Generate block explorer link
        const explorerUrl = getBlockExplorerUrl(result.hash, selectedNetwork === 'evm' ? 'base' : 'solana');
        
        // Format success message
        const networkName = selectedNetwork === 'evm' ? 'Base' : 'Solana';
        const tokenSymbol = isNativeToken ? 
          (selectedNetwork === 'evm' ? 'ETH' : 'SOL') : 
          (token?.toUpperCase() || 'TOKEN');

        // Track token_sent event
        try {
          const { HedwigEvents } = await import('../lib/posthog');
          await HedwigEvents.tokensSent(userId, {
            amount: parseFloat(amount),
            token: tokenSymbol,
            recipient: recipientAddress,
            network: networkName.toLowerCase(),
            transaction_hash: result.hash
          });
          console.log('PostHog: Tokens sent event tracked successfully');
        } catch (trackingError) {
          console.error('PostHog tracking error for tokens_sent:', trackingError);
        }

        return {
          text: `✅ **Transfer Successful!**\n\n` +
                `💰 **Amount**: ${amount} ${tokenSymbol}\n` +
                `🌐 **Network**: ${networkName}\n` +
                `📍 **To**: \`${recipientAddress}\`\n` +
                `🔗 **Transaction**: ${result.hash}\n\n` +
                `Your crypto has been sent successfully!`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔗 View Transaction", url: explorerUrl },
                { text: "📦 Check Balance", callback_data: "refresh_balances" }
              ]
            ]
          }
        };

      } catch (error) {
        console.error('[handleSend] Transfer error:', error);
        return {
          text: `❌ **Transfer Failed**\n\n` +
                `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                `Please check:\n` +
                `• You have sufficient balance\n` +
                `• The recipient address is valid\n` +
                `• The network is correct`
        };
      }
    }

    // Check if we have all required information for confirmation
    if (amount && recipientAddress && (token || network)) {
      // We have all the info - show confirmation with gas estimation
      
      // Function to detect if an address is a Solana address
      const isSolanaAddress = (address: string): boolean => {
        // Solana addresses are 32-44 characters long and use base58 encoding
        // They typically don't contain 0, O, I, or l characters
        const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        return solanaAddressRegex.test(address) && address.length >= 32 && address.length <= 44;
      };

      // Determine which wallet to use based on token/network/recipient address
      let selectedWallet;
      let selectedNetwork;
      let networkName;
      
      if (token?.toLowerCase() === 'sol' || 
          network?.toLowerCase() === 'solana' || 
          isSolanaAddress(recipientAddress)) {
        selectedWallet = wallets.find(w => w.chain === 'solana');
        selectedNetwork = 'solana';
        networkName = 'Solana';
      } else {
        // Default to EVM for ETH, USDC, etc.
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'base';
        networkName = 'Base';
      }

      if (!selectedWallet) {
        return {
          text: `❌ You don't have a ${networkName} wallet. Please create one first.`
        };
      }

      // Determine transaction type for gas estimation
      const isNativeToken = (
        (selectedNetwork === 'base' && (!token || token.toLowerCase() === 'eth')) ||
      (selectedNetwork === 'solana' && (!token || token.toLowerCase() === 'sol'))
      );
      
      const transactionType = isNativeToken ? 'native' : 'token';
      
      // Estimate gas fee
      let estimatedFee;
      try {
        estimatedFee = await estimateTransactionFee(selectedNetwork, transactionType);
      } catch (error) {
        console.error('[handleSend] Fee estimation error:', error);
        estimatedFee = selectedNetwork.includes('solana') ? '~0.000005 SOL' : '~0.0001 ETH';
      }

      // Determine token symbol for display
      const tokenSymbol = isNativeToken ? 
        (selectedNetwork.includes('solana') ? 'SOL' : 'ETH') : 
        (token?.toUpperCase() || 'TOKEN');

      // Truncate addresses for display
      const truncatedRecipient = `${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`;
      const truncatedFrom = `${selectedWallet.address.slice(0, 8)}...${selectedWallet.address.slice(-6)}`;

      // Create a short transaction ID for callback data
      const transactionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      
      // Store transaction details temporarily (you could use Redis or database for production)
      // For now, we'll encode essential info in a shorter format
      const shortCallbackData = `confirm_${transactionId}`;

      return {
        text: `💸 **Confirm Transfer**\n\n` +
              `**Transaction Summary:**\n` +
              `💰 Amount: **${amount} ${tokenSymbol}**\n` +
              `🌐 Network: **${networkName}**\n` +
              `📤 From: \`${truncatedFrom}\`\n` +
              `📥 To: \`${truncatedRecipient}\`\n` +
              `⛽ Est. Fee: **${estimatedFee}**\n` +
              `⏱️ Est. Time: **~30 seconds**\n\n` +
              `⚠️ **Please verify all details before confirming.**\n` +
              `This transaction cannot be reversed.\n\n` +
              `**Transaction Details:**\n` +
              `Amount: ${amount}\n` +
              `Token: ${token || 'native'}\n` +
              `To: ${recipientAddress}\n` +
              `Network: ${selectedNetwork}`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Confirm & Send", callback_data: shortCallbackData },
              { text: "❌ Cancel", callback_data: "cancel_send" }
            ]
          ]
        }
      };
    }

    // If we don't have all the information, show the single template to collect everything
    return {
      text: "💸 **Send Crypto**\n\n" +
            "Please provide the following information in your message:\n\n" +
            "**Required Details:**\n" +
            "• **Amount & Token**: e.g., `0.1 ETH`, `10 USDC`, `5 SOL`\n" +
            "• **Recipient Address**: The destination wallet address\n" +
            "• **Network/Chain**: `Base`, `Solana`, or specify token type\n\n" +
            "**Example Messages:**\n" +
            "• `Send 0.1 ETH to 0x1234...5678 on Base`\n" +
            "• `Transfer 10 USDC to 9WzD...AWWM on Solana`\n" +
            "• `Send 5 SOL to alice.sol`\n\n" +
            "**Supported Tokens:**\n" +
            "• ETH (Base network)\n" +
            "• USDC (Base or Solana)\n" +
            "• SOL (Solana network)\n\n" +
            "💡 **Tip**: Include all details in one message for faster processing!"
    };

  } catch (error) {
    console.error('[handleSend] Error:', error);
    return {
      text: "❌ Failed to process send request. Please try again later."
    };
  }
}

async function handleCreatePaymentLink(params: ActionParams, userId: string) {
  try {
    // Determine if userId is a UUID or username and get the actual user UUID
    let actualUserId: string;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      actualUserId = userId;
    } else {
      // userId is a username, fetch the actual UUID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[handleCreatePaymentLink] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      actualUserId = user.id;
    }

    // Get user wallets and user info
    const [walletsResult, userResult] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", actualUserId),
      supabase.from("users").select("name, email").eq("id", actualUserId).single()
    ]);

    const { data: wallets } = walletsResult;
    const { data: user } = userResult;

    if (!wallets || wallets.length === 0) {
      return {
        text: "You don't have any wallets yet. Type 'create wallet' to get started!"
      };
    }

    // Find EVM wallet (payment links currently support EVM chains)
    const evmWallet = wallets.find(w => w.chain === 'evm');
    if (!evmWallet) {
      return {
        text: "You need an EVM wallet to create payment links. Please create a wallet first."
      };
    }

    // Extract parameters from the request
    const { amount, token, network, recipient_email, for: paymentReason, description } = params;
    const finalPaymentReason = paymentReason || description;

    // Check if we have all required information
    if (!amount || !token || !finalPaymentReason) {
      return {
        text: "💳 **Create Payment Link**\n\n" +
              "Please provide the following information:\n\n" +
              "**Required Details:**\n" +
              "• **Amount**: e.g., `100 USDC`\n" +
              "• **Purpose**: What the payment is for\n" +
              "• **Network** (optional): `base`, `ethereum`, `polygon`\n" +
              "• **Recipient Email** (optional): To send the link via email\n\n" +
              "**Example Messages:**\n" +
              "• `Create payment link for 100 USDC for web development`\n" +
              "• `Payment link 50 USDC for consulting services`\n" +
              "• `Link for 25 USDC for design work, send to client@example.com`\n\n" +
              "**💰 Supported Token:**\n" +
              "• **USDC only** - All payment links use USDC stablecoin\n\n" +
              "💡 **Tip**: Include all details in one message for faster processing!"
      };
    }

    // Set default values
    const selectedNetwork = network?.toLowerCase() || 'base';
    const selectedToken = token?.toUpperCase() || 'USDC';
    const userName = user?.name || 'Hedwig User';

    // Validate network and token
    const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism', 'celo'];
    const supportedTokens = ['USDC']; // Only USDC stablecoin is supported

    if (!supportedNetworks.includes(selectedNetwork)) {
      return {
        text: `❌ Unsupported network: ${selectedNetwork}\n\nSupported networks: ${supportedNetworks.join(', ')}`
      };
    }

    if (!supportedTokens.includes(selectedToken)) {
      return {
        text: `❌ Unsupported token: ${selectedToken}\n\nSupported tokens: ${supportedTokens.join(', ')}`
      };
    }

    try {
      // Use direct payment link service
      const { createPaymentLink } = await import('../lib/paymentlinkservice');
      
      // Debug environment variables
      console.log('Environment check in actions.ts:', {
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
        VERCEL_URL: process.env.VERCEL_URL
      });
      
      const result = await createPaymentLink({
        amount: parseFloat(amount),
        token: selectedToken,
        network: selectedNetwork,
        walletAddress: evmWallet.address,
        userName: userName,
        paymentReason: finalPaymentReason,
        recipientEmail: recipient_email,
        userId: actualUserId // Pass the user ID
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create payment link');
      }

      // Format success message
      const paymentUrl = result.paymentLink;
      
      let successMessage = `✅ **Payment Link Created Successfully!** 💳\n\n` +
                          `💰 **Amount**: ${amount} ${selectedToken}\n` +
                          `🌐 **Network**: ${selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1)}\n` +
                          `💼 **For**: ${paymentReason}\n` +
                          `👛 **Wallet**: \`${evmWallet.address.slice(0, 8)}...${evmWallet.address.slice(-6)}\`\n\n` +
                          `🔗 **Payment Link**: ${paymentUrl}\n\n`;

      if (recipient_email) {
        successMessage += `📧 **Email sent to**: ${recipient_email}\n\n`;
      }

      successMessage += `💡 **Share this link** with anyone who needs to pay you!\n` +
                       `⏰ **Link expires** in 7 days\n\n` +
                       `You'll be notified when payments are received.`;

      return {
        text: successMessage,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔗 Open Payment Link", url: paymentUrl },
              { text: "📊 View Earnings", callback_data: "view_earnings" }
            ]
          ]
        }
      };

    } catch (error) {
      console.error('[handleCreatePaymentLink] API call error:', error);
      return {
        text: `❌ **Failed to create payment link**\n\n` +
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
              `Please check:\n` +
              `• Your wallet is properly set up\n` +
              `• The amount and token are valid\n` +
              `• The network is supported\n\n` +
              `Try again or contact support if the issue persists.`
      };
    }

  } catch (error) {
    console.error('[handleCreatePaymentLink] Error:', error);
    return {
      text: "❌ Failed to process payment link request. Please try again later."
    };
  }
}

async function handleSwap(params: ActionParams, userId: string) {
  try {
    // Determine if userId is a UUID or username and get the actual user UUID
    let actualUserId: string;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      actualUserId = userId;
    } else {
      // userId is a username, fetch the actual UUID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[handleSwap] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      actualUserId = user.id;
    }

    // Get user wallets
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);

    if (!wallets || wallets.length === 0) {
      return {
        text: "You don't have any wallets yet. Type 'create wallet' to get started!"
      };
    }

    // Extract parameters from the request
    const { amount, from_token, to_token, network } = params;

    if (!amount || !from_token || !to_token) {
      return {
        text: "🔄 **Token Swap**\n\nTo swap tokens, please provide:\n• Amount to swap\n• Token to swap from\n• Token to swap to\n\nExample: 'Swap 10 USDC to ETH'\n\nSupported tokens: ETH, USDC, SOL"
      };
    }

    // Determine which wallet to use based on tokens
    let selectedWallet;
    let selectedNetwork;
    
    // For now, we'll support EVM swaps (ETH <-> USDC)
    if ((from_token?.toLowerCase() === 'eth' || from_token?.toLowerCase() === 'usdc') &&
        (to_token?.toLowerCase() === 'eth' || to_token?.toLowerCase() === 'usdc')) {
      selectedWallet = wallets.find(w => w.chain === 'evm');
      selectedNetwork = 'evm';
    } else if ((from_token?.toLowerCase() === 'sol') || (to_token?.toLowerCase() === 'sol')) {
      return {
        text: "🔄 **Solana Swaps Coming Soon**\n\nSolana token swaps are not yet supported. Currently only EVM swaps (ETH ↔ USDC) are available.\n\nPlease try swapping between ETH and USDC."
      };
    } else {
      return {
        text: `❌ Unsupported swap pair: ${from_token} → ${to_token}\n\nCurrently supported swaps:\n• ETH ↔ USDC\n\nMore trading pairs coming soon!`
      };
    }

    if (!selectedWallet) {
      return {
        text: `❌ You don't have an EVM wallet. Please create one first.`
      };
    }

    // For now, return a message indicating swap is being prepared
    // TODO: Integrate with actual swap functionality using TokenSwapManager contract
    return {
      text: `🔄 **Swap Preparation**\n\n` +
            `💱 **Swap**: ${amount} ${from_token?.toUpperCase()} → ${to_token?.toUpperCase()}\n` +
            `🌐 **Network**: EVM\n` +
            `👛 **Wallet**: \`${selectedWallet.address}\`\n\n` +
            `⚠️ **Note**: Token swapping functionality is currently being integrated with our smart contracts. This feature will be fully available soon!\n\n` +
            `For now, you can use the send feature to transfer tokens directly.`
    };

  } catch (error) {
    console.error('[handleSwap] Error:', error);
    return {
      text: "❌ Failed to process swap request. Please try again later."
    };
  }
}

/**
 * Handle deposit notification with inline buttons
 * @param amount - Amount received
 * @param token - Token symbol
 * @param network - Network name
 * @param fromAddress - Sender address
 * @param txHash - Transaction hash
 * @returns Formatted deposit notification with inline buttons
 */
async function handleDepositNotification(
  amount: string,
  token: string,
  network: string,
  fromAddress: string,
  txHash: string
) {
  try {
    // Generate block explorer link
    const explorerUrl = getBlockExplorerUrl(txHash, network);
    
    // Format the sender address (truncate for display)
    const truncatedFrom = `${fromAddress.slice(0, 8)}...${fromAddress.slice(-4)}`;
    
    // Format network name for display
    const networkName = network === 'solana' ? 'Solana' :
      network === 'base' ? 'Base' : 
                       network.charAt(0).toUpperCase() + network.slice(1);

    const message = `+${amount} ${token.toUpperCase()} just came in\n` +
                   `🌐 Network: ${networkName}\n` +
                   `👤 From: ${truncatedFrom}\n` +
                   `🔗 Tx: View on Explorer\n\n` +
                   `What would you like to do next?`;

    return {
      text: message,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔗 View Tx", url: explorerUrl },
            { text: "💼 Check Balances", callback_data: "refresh_balances" }
          ]
        ]
      }
    };
  } catch (error) {
    console.error('[handleDepositNotification] Error:', error);
    return {
      text: `+${amount} ${token.toUpperCase()} received! Check your balance for details.`
    };
  }
}

// Manual reminder function
async function sendManualReminder(userId: string, params: ActionParams): Promise<ActionResult> {
  try {
    // Extract target type, target ID, and custom message from params
    let targetType = params.targetType || params.type;
    let targetId = params.targetId || params.id;
    const customMessage = params.message || params.text || params.customMessage;
    const clientEmail = params.clientEmail;
    const reminderType = params.reminderType || 'standard'; // 'standard' or 'due_date'
    
    // If we have a targetId but no targetType, try to determine the type
    if (targetId && !targetType) {
      // Try to find the target in both payment_links and invoices
      const { data: paymentLink } = await supabase
        .from('payment_links')
        .select('id')
        .eq('id', targetId)
        .eq('user_id', userId)
        .single();
      
      if (paymentLink) {
        targetType = 'payment_link';
      } else {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('id', targetId)
          .eq('user_id', userId)
          .single();
        
        if (invoice) {
          targetType = 'invoice';
        }
      }
    }
    
    // If we have a client email but no specific target, find the most recent unpaid item for that client
    if (clientEmail && !targetId) {
      const items = await SmartNudgeService.getUserRemindableItems(userId);
      
      // Look for items with matching client email
      const matchingPaymentLink = items.paymentLinks.find(link => 
        link.clientEmail.toLowerCase() === clientEmail.toLowerCase()
      );
      const matchingInvoice = items.invoices.find(invoice => 
        invoice.clientEmail.toLowerCase() === clientEmail.toLowerCase()
      );
      
      if (matchingPaymentLink) {
        targetType = 'payment_link';
        targetId = matchingPaymentLink.id;
      } else if (matchingInvoice) {
        targetType = 'invoice';
        targetId = matchingInvoice.id;
      }
    }
    
    // If still no specific target, show available options with better formatting
    if (!targetType || !targetId) {
      const items = await SmartNudgeService.getUserRemindableItems(userId);
      
      if (items.paymentLinks.length === 0 && items.invoices.length === 0) {
        return {
          text: "📭 You don't have any unpaid payment links or invoices to send reminders for."
        };
      }
      
      let itemsList = '📋 **Choose what to remind about:**\n\n';
      
      if (items.paymentLinks.length > 0) {
        itemsList += '💳 **Payment Links:**\n';
        items.paymentLinks.forEach((link, index) => {
          itemsList += `${index + 1}. ${link.title} - $${link.amount}\n   📧 ${link.clientEmail}\n   🆔 \`${link.id}\`\n\n`;
        });
      }
      
      if (items.invoices.length > 0) {
        itemsList += '📄 **Invoices:**\n';
        items.invoices.forEach((invoice, index) => {
          itemsList += `${index + 1}. ${invoice.title} - $${invoice.amount}\n   📧 ${invoice.clientEmail}\n   🆔 \`${invoice.id}\`\n\n`;
        });
      }
      
      itemsList += '💡 **How to send a reminder:**\n';
      itemsList += '• "Remind about payment link [ID]"\n';
      itemsList += '• "Send reminder for invoice [ID]"\n';
      itemsList += '• "Remind [client@email.com]"\n';
      itemsList += '• "Send reminder with message: [your message]"';
      
      return {
        text: itemsList
      };
    }
    
    // Validate target type
    if (!['payment_link', 'invoice'].includes(targetType)) {
      return {
        text: "❌ Invalid target type. Must be 'payment_link' or 'invoice'."
      };
    }
    
    // Send the reminder - use appropriate service based on type and target
    let result;
    if (reminderType === 'due_date' && targetType === 'invoice') {
      // Use InvoiceReminderService for due date reminders on invoices
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', targetId)
        .eq('user_id', userId)
        .single();
      
      if (!invoice) {
        return {
          text: "❌ Invoice not found or you don't have permission to send reminders for it."
        };
      }
      
      result = await InvoiceReminderService.sendDueDateReminder(invoice, 'manual');
      
      if (result.success) {
        result.message = `Due date reminder sent to ${invoice.client_email} for invoice ${invoice.invoice_number}`;
      } else {
        result.message = result.error || 'Failed to send due date reminder';
      }
    } else {
      // Use SmartNudgeService for standard reminders
      result = await SmartNudgeService.sendManualReminder(targetType as 'payment_link' | 'invoice', targetId, customMessage);
    }
    
    if (result.success) {
      return {
        text: `✅ Reminder sent successfully!\n\n${result.message}`
      };
    } else {
      return {
        text: `❌ Failed to send reminder: ${result.message}`
      };
    }
  } catch (error) {
    console.error('[sendManualReminder] Error:', error);
    return {
      text: "❌ Failed to send reminder. Please try again later."
    };
  }
}

async function handleCreateInvoice(params: ActionParams, userId: string) {
  try {
    // Determine if userId is a UUID or username and get the actual user UUID
    let actualUserId: string;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      actualUserId = userId;
    } else {
      // userId is a username, fetch the actual UUID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[handleCreateInvoice] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      actualUserId = user.id;
    }

    // Import and use the invoice creation service
    const { InvoiceModule } = await import('../modules/invoices');
    
    // Get the user's chat ID for Telegram interaction
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', actualUserId)
      .single();
    
    if (!user?.telegram_chat_id) {
      return {
        text: "❌ Telegram chat ID not found. Please make sure you're using the Telegram bot."
      };
    }
    
    // Initialize the bot and start invoice creation
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    const invoiceModule = new InvoiceModule(bot);
    
    await invoiceModule.handleInvoiceCreation(user.telegram_chat_id, actualUserId);
    
    // Return empty text to avoid interrupting the flow
    return {
      text: ""
    };

  } catch (error) {
    console.error('[handleCreateInvoice] Error:', error);
    return {
      text: "❌ Failed to start invoice creation. Please try again later."
    };
  }
}

async function handleCreateProposal(params: ActionParams, userId: string) {
  try {
    // Determine if userId is a UUID or username and get the actual user UUID
    let actualUserId: string;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      actualUserId = userId;
    } else {
      // userId is a username, fetch the actual UUID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[handleCreateProposal] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      actualUserId = user.id;
    }

    // Import and use the proposal creation service with bot integration
    const { ProposalModule } = await import('../modules/proposals');
    
    // Get the user's chat ID for Telegram interaction
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', actualUserId)
      .single();
    
    if (!user?.telegram_chat_id) {
      return {
        text: "❌ Telegram chat ID not found. Please make sure you're using the Telegram bot."
      };
    }
    
    // Initialize the bot and start proposal creation
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    const proposalModule = new ProposalModule(bot);
    
    await proposalModule.handleProposalCreation(user.telegram_chat_id, actualUserId);
    
    // Return empty text to avoid interrupting the flow
    return {
      text: ""
    };

  } catch (error) {
    console.error('[handleCreateProposal] Error:', error);
    return {
      text: "❌ Failed to start proposal creation. Please try again later."
    };
  }
}

// Handle offramp intent
// Handle offramp intent with multi-step guided flow
async function handleOfframp(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }

    // Handle callback data for session navigation
    if (params.callback_data) {
      // Check for existing active session only when handling callbacks
      let session = await offrampSessionService.getActiveSession(actualUserId);
      return await handleOfframpCallback(params.callback_data, actualUserId, session);
    }

    // Check for existing session first
    let session = await offrampSessionService.getActiveSession(actualUserId);
    
    // If there's an existing session, continue with it (for text input like account numbers)
    // BUT only if the text is not a command to start fresh offramp
    if (session && params.text && !params.text.toLowerCase().includes('offramp')) {
      console.log('[handleOfframp] Continuing existing session with text input');
      return await handleOfframpStep(session, params, actualUserId);
    }
    
    // Clear session only when starting completely fresh (no existing session or explicit new start)
    if (session) {
      console.log('[handleOfframp] Clearing existing session to start fresh');
      await offrampSessionService.clearSession(session.id);
      session = null;
    }

    // Parse natural language for amount extraction
    if (params.text) {
      const extractedAmount = extractAmountFromText(params.text);
      if (extractedAmount) {
        // Start new session with extracted amount
        session = await offrampSessionService.createSession(actualUserId);
        await offrampSessionService.updateSession(session.id, 'amount', {
          amount: extractedAmount,
          token: 'USDC'
        });
        
        // Validate the amount and proceed to payout method
        const amountValidation = await validateOfframpAmount(extractedAmount, actualUserId);
        if (!amountValidation.valid) {
          await offrampSessionService.clearSession(session.id);
          return amountValidation.response!;
        }
        
        // Update session to payout method step
        await offrampSessionService.updateSession(session.id, 'payout_method', {
          amount: extractedAmount,
          token: 'USDC'
        });
        
        return {
          text: `🏦 **USDC Withdrawal - Step 2 of 5**\n\n` +
                `💰 **Amount:** ${extractedAmount} USDC\n\n` +
                `💳 **Choose your payout method:**\n\n` +
                `We support bank account withdrawals to:`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🇳🇬 Bank Account (NGN)", callback_data: "payout_bank_ngn" }
              ],
              [
                { text: "🇰🇪 Bank Account (KES)", callback_data: "payout_bank_kes" }
              ],
              [
                { text: "⬅️ Back", callback_data: "offramp_edit" },
                { text: "❌ Cancel", callback_data: "offramp_cancel" }
              ]
            ]
          }
        };
      }
    }

    // Only start new offramp flow if no callback data was provided
    // If callback_data exists, it means we're handling a button press, not starting fresh
    if (!params.callback_data) {
      return await startOfframpFlow(actualUserId);
    }
    
    // If we reach here with callback_data but no session, something went wrong
    return {
      text: "❌ Session expired. Please start a new withdrawal by typing 'offramp' or using the /offramp command."
    };
    
  } catch (error) {
    console.error('[handleOfframp] Unexpected error:', error);
    return {
      text: "❌ An unexpected error occurred. Please try again later."
    };
  }
}

// Extract amount from natural language text
function extractAmountFromText(text: string): number | null {
  const normalizedText = text.toLowerCase().trim();
  
  // Pattern 1: "1 usdc", "5.5 USDC", "10 usdc"
  let match = normalizedText.match(/(\d+(?:\.\d+)?)\s*usdc/i);
  if (match) {
    return parseFloat(match[1]);
  }
  
  // Pattern 2: "withdraw 1 usdc", "withdraw 5.5 USDC to my bank"
  match = normalizedText.match(/withdraw\s+(\d+(?:\.\d+)?)\s*usdc/i);
  if (match) {
    return parseFloat(match[1]);
  }
  
  // Pattern 3: "i want to withdraw 1 usdc", "I want to withdraw 5.5 USDC to my bank account"
  match = normalizedText.match(/(?:i\s+want\s+to\s+withdraw|want\s+to\s+withdraw)\s+(\d+(?:\.\d+)?)\s*usdc/i);
  if (match) {
    return parseFloat(match[1]);
  }
  
  return null;
}

// Validate offramp amount against user balance
async function validateOfframpAmount(amount: number, userId: string): Promise<{valid: boolean, response?: ActionResult}> {
  if (isNaN(amount) || amount <= 0) {
    return {
      valid: false,
      response: {
        text: "❌ Please enter a valid positive number.\n\nExample: 50 or 100.5",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      }
    };
  }

  if (amount < 1) {
    return {
      valid: false,
      response: {
        text: "❌ Minimum withdrawal amount is $1 USD equivalent.\n\nPlease enter a higher amount.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      }
    };
  }

  // Check user's USDC balance
  const { data: wallets } = await supabase
    .from('wallets')
    .select('address, chain')
    .eq('user_id', userId);

  // Map to expected format
  const userWallets = wallets?.map(wallet => ({
    wallet_address: wallet.address,
    network: wallet.chain
  }));

  let totalUsdcBalance = 0;
  if (userWallets) {
    for (const wallet of userWallets) {
      try {
        const balances = await getBalances(wallet.wallet_address, wallet.network);
        let balanceArray = balances?.data || balances || [];
        
        for (const balance of balanceArray) {
          if (balance.asset?.symbol === 'USDC') {
            const decimals = balance.asset.decimals || 6;
            // Handle hex string amounts properly
            let rawAmount: bigint;
            if (typeof balance.amount === 'string' && balance.amount.startsWith('0x')) {
              rawAmount = BigInt(balance.amount);
            } else {
              rawAmount = BigInt(balance.amount || '0');
            }
            const balanceAmount = Number(rawAmount) / Math.pow(10, decimals);
            totalUsdcBalance += balanceAmount;
          }
        }
      } catch (error) {
        console.error(`Error getting balance for wallet ${wallet.wallet_address}:`, error);
      }
    }
  }

  if (amount > totalUsdcBalance) {
    return {
      valid: false,
      response: {
        text: `❌ Insufficient balance.\n\nRequested: ${amount} USDC\nAvailable: ${totalUsdcBalance.toFixed(6)} USDC\n\nPlease enter a lower amount.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      }
    };
  }

  return { valid: true };
}

// Start new offramp flow
async function startOfframpFlow(userId: string): Promise<ActionResult> {
  try {
    // Get user wallets and check USDC balance
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', userId);

    // Map to expected format
    const userWallets = wallets?.map(wallet => ({
      wallet_address: wallet.address,
      network: wallet.chain
    }));

    if (walletsError || !userWallets || userWallets.length === 0) {
      return {
        text: "Your wallets are being set up automatically. Please try again in a moment."
      };
    }

    let totalUsdcBalance = 0;
    let balanceMessages: string[] = [];

    // Check balances for each wallet
    for (const wallet of userWallets) {
      try {
        const balances = await getBalances(wallet.wallet_address, wallet.network);
        
        // Handle different response structures
        let balanceArray;
        if (balances && balances.data && Array.isArray(balances.data)) {
          balanceArray = balances.data;
        } else if (Array.isArray(balances)) {
          balanceArray = balances;
        } else {
          console.warn(`Invalid balances response for ${wallet.wallet_address}:`, balances);
          continue;
        }

        // Process each balance
        for (const balance of balanceArray) {
          if (balance.asset && balance.asset.symbol === 'USDC') {
            // Convert from wei to human readable format
            const decimals = balance.asset.decimals || 6;
            // Handle hex string amounts properly
            let rawAmount: bigint;
            if (typeof balance.amount === 'string' && balance.amount.startsWith('0x')) {
              rawAmount = BigInt(balance.amount);
            } else {
              rawAmount = BigInt(balance.amount || '0');
            }
            const amount = Number(rawAmount) / Math.pow(10, decimals);
            
            if (amount > 0) {
              totalUsdcBalance += amount;
              balanceMessages.push(`💰 ${amount.toFixed(6)} USDC on ${wallet.network}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error getting balance for wallet ${wallet.wallet_address}:`, error);
      }
    }

    if (totalUsdcBalance === 0) {
      return {
        text: "❌ No USDC balance found. Please deposit USDC to your wallet first."
      };
    }

    // Check minimum amount (equivalent to $1 USD)
    if (totalUsdcBalance < 1) {
      return {
        text: `❌ Insufficient balance for offramp. Minimum required: $1 USD equivalent.\n\nYour current balance: ${totalUsdcBalance.toFixed(6)} USDC`
      };
    }

    // Create new session
    const session = await offrampSessionService.createSession(userId);
    
    const balanceText = balanceMessages.join('\n');
    
    return {
      text: `🏦 **USDC Withdrawal - Step 1 of 5**\n\n` +
            `💰 **Your Available Balance:**\n${balanceText}\n\n` +
            `**Total:** ${totalUsdcBalance.toFixed(6)} USDC\n\n` +
            `💡 **How much USDC would you like to withdraw?**\n\n` +
            `Please enter the amount with token symbol (minimum $1 USD equivalent):\n` +
            `Example: 50 USDC or 100.5 USDC`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "❌ Cancel", callback_data: "offramp_cancel" }
          ]
        ]
      }
    };
    
  } catch (error) {
    console.error('[startOfframpFlow] Error:', error);
    return {
      text: "❌ Failed to start withdrawal process. Please try again later."
    };
  }
}

// Handle offramp step based on current session
async function handleOfframpStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    console.log('[handleOfframpStep] Session step:', session.step, 'Callback:', params.callback_data);
    
    switch (session.step) {
      case 'amount':
        return await handleAmountStep(session, params, userId);
      case 'payout_method':
        return await handlePayoutMethodStep(session, params, userId);
      case 'bank_selection':
        return await handleBankSelectionStep(session, params, userId);
      case 'account_number':
        return await handleAccountNumberStep(session, params, userId);
      case 'confirmation':
        return await handleConfirmationStep(session, params, userId);
      case 'final_confirmation':
        return await handleFinalConfirmationStep(session, params, userId);
      case 'creating_order':
      case 'awaiting_transfer':
      case 'transferring_tokens':
      case 'transfer_completed':
        // These steps are handled by callbacks, show current status
        return {
          text: `⏳ Your transaction is being processed. Current status: ${session.step.replace('_', ' ')}`
        };
      default:
        console.log('[handleOfframpStep] Invalid session state:', session.step);
        // Invalid session state, restart
        await offrampSessionService.clearSession(session.id);
        return await startOfframpFlow(userId);
    }
  } catch (error) {
    console.error('[handleOfframpStep] Error:', error);
    return {
      text: "❌ An error occurred. Please try again."
    };
  }
}

// Handle callback data for session navigation
async function handleOfframpCallback(callbackData: string, userId: string, session: any): Promise<ActionResult> {
  try {
    console.log(`[handleOfframpCallback] Called with callbackData: ${callbackData}, session step: ${session?.step}`);
    console.log(`[handleOfframpCallback] Session data:`, JSON.stringify(session?.data, null, 2));
    
    if (callbackData === 'offramp_cancel') {
      console.log(`[handleOfframpCallback] Processing cancel request for user ${userId}`);
      if (session) {
        console.log(`[handleOfframpCallback] Clearing session ${session.id}`);
        await offrampSessionService.clearSession(session.id);
        console.log(`[handleOfframpCallback] Session cleared successfully`);
      } else {
        console.log(`[handleOfframpCallback] No active session found for cancel`);
      }
      return {
        text: "❌ Withdrawal cancelled. You can start a new withdrawal anytime by typing 'offramp'."
      };
    }
    
    // Note: offramp_confirm is handled by handleConfirmationStep through step routing
    
    if (callbackData === 'offramp_edit' && session) {
      // Go back to amount step
      await offrampSessionService.updateSession(session.id, 'amount', {});
      return await startOfframpFlow(userId);
    }
    
    // Handle step-specific callbacks by routing to appropriate step handler
    if (session) {
      const stepParams = { callback_data: callbackData };
      return await handleOfframpStep(session, stepParams, userId);
    }
    
    return {
      text: "❌ Invalid action. Please try again."
    };
    
  } catch (error) {
    console.error('[handleOfframpCallback] Error:', error);
    return {
      text: "❌ An error occurred. Please try again."
    };
  }
}

// Handle amount input step
async function handleAmountStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const amountText = params.text?.trim();
    if (!amountText) {
      return {
        text: "❌ Please enter a valid amount with token symbol.\n\nExample: 50 USDC or 100.5 USDC",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Parse amount and token from text (e.g., "50 USDC")
    const normalizedText = amountText.toLowerCase().trim();
    const match = normalizedText.match(/(\d+(?:\.\d+)?)\s*usdc/i);
    
    if (!match) {
      return {
        text: "❌ Please enter the amount with USDC token symbol.\n\nExample: 50 USDC or 100.5 USDC",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    const amount = parseFloat(match[1]);
    if (isNaN(amount) || amount <= 0) {
      return {
        text: "❌ Please enter a valid positive amount.\n\nExample: 50 USDC or 100.5 USDC",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    if (amount < 1) {
      return {
        text: "❌ Minimum withdrawal amount is $1 USD equivalent.\n\nPlease enter a higher amount.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Check user's USDC balance
    const { data: wallets } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', userId);

    // Map to expected format
    const userWallets = wallets?.map(wallet => ({
      wallet_address: wallet.address,
      network: wallet.chain
    }));

    let totalUsdcBalance = 0;
    if (userWallets) {
      for (const wallet of userWallets) {
        try {
          const balances = await getBalances(wallet.wallet_address, wallet.network);
          let balanceArray = balances?.data || balances || [];
          
          for (const balance of balanceArray) {
            if (balance.asset?.symbol === 'USDC') {
              const decimals = balance.asset.decimals || 6;
              // Handle hex string amounts properly
              let rawAmount: bigint;
              if (typeof balance.amount === 'string' && balance.amount.startsWith('0x')) {
                rawAmount = BigInt(balance.amount);
              } else {
                rawAmount = BigInt(balance.amount || '0');
              }
              const balanceAmount = Number(rawAmount) / Math.pow(10, decimals);
              totalUsdcBalance += balanceAmount;
            }
          }
        } catch (error) {
          console.error(`Error getting balance for wallet ${wallet.wallet_address}:`, error);
        }
      }
    }

    if (amount > totalUsdcBalance) {
      return {
        text: `❌ Insufficient balance.\n\nRequested: ${amount} USDC\nAvailable: ${totalUsdcBalance.toFixed(6)} USDC\n\nPlease enter a lower amount.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Update session with amount and move to payout method step
    await offrampSessionService.updateSession(session.id, 'payout_method', {
      amount: amount,
      token: 'USDC'
    });

    return {
      text: `🏦 **USDC Withdrawal - Step 2 of 5**\n\n` +
            `💰 **Amount:** ${amount} USDC\n\n` +
            `💳 **Choose your payout method:**\n\n` +
            `We support bank account withdrawals to:`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🇳🇬 Bank Account (NGN)", callback_data: "payout_bank_ngn" }
          ],
          [
            { text: "🇰🇪 Bank Account (KES)", callback_data: "payout_bank_kes" }
          ],
          [
            { text: "⬅️ Back", callback_data: "offramp_edit" },
            { text: "❌ Cancel", callback_data: "offramp_cancel" }
          ]
        ]
      }
    };

  } catch (error) {
    console.error('[handleAmountStep] Error:', error);
    return {
      text: "❌ An error occurred. Please try again."
    };
  }
}

// Handle payout method selection step
async function handlePayoutMethodStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    console.log('[handlePayoutMethodStep] Called with callback_data:', params.callback_data);
    
    // If no callback_data or action_offramp, show payout method selection UI
    if (!params.callback_data || params.callback_data === 'action_offramp') {
      return {
        text: `🏦 **USDC Withdrawal - Step 2 of 5**\n\n` +
              `💰 **Amount:** ${session.data.amount} USDC\n\n` +
              `💳 **Choose your payout method:**\n\n` +
              `We support bank account withdrawals to:`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🇳🇬 Bank Account (NGN)", callback_data: "payout_bank_ngn" }
            ],
            [
              { text: "🇰🇪 Bank Account (KES)", callback_data: "payout_bank_kes" }
            ],
            [
              { text: "⬅️ Back", callback_data: "offramp_edit" },
              { text: "❌ Cancel", callback_data: "offramp_cancel" }
            ]
          ]
        }
      };
    }
    
    let currency: string;
    let currencyFlag: string;
    let currencyName: string;

    if (params.callback_data === 'payout_bank_ngn') {
      currency = 'NGN';
      currencyFlag = '🇳🇬';
      currencyName = 'Nigerian Naira';
    } else if (params.callback_data === 'payout_bank_kes') {
      currency = 'KES';
      currencyFlag = '🇰🇪';
      currencyName = 'Kenyan Shilling';
    } else {
      console.log('[handlePayoutMethodStep] Invalid callback_data:', params.callback_data);
      return {
        text: "❌ Invalid payout method. Please try again."
      };
    }

    console.log('[handlePayoutMethodStep] Processing currency:', currency);

    // Update session and move to bank selection
    await offrampSessionService.updateSession(session.id, 'bank_selection', {
      ...session.data,
      payoutMethod: 'bank_account',
      currency: currency
    });

    console.log('[handlePayoutMethodStep] Session updated, fetching banks for:', currency);

    // Get supported banks from Paycrest API
    const supportedBanks = await offrampService.getSupportedInstitutions(currency);
    
    console.log('[handlePayoutMethodStep] Fetched banks:', supportedBanks.length, 'banks');

    if (supportedBanks.length === 0) {
      return {
        text: `❌ Unable to load banks for ${currencyName}. Please try again later.`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️ Back", callback_data: "back_to_payout" },
              { text: "❌ Cancel", callback_data: "offramp_cancel" }
            ]
          ]
        }
      };
    }

    // Create inline keyboard for bank selection
    const bankButtons = supportedBanks.map(bank => [
      { text: bank.name, callback_data: `select_bank_${bank.code}_${bank.name}_${currency}` }
    ]);
    
    // Add back and cancel buttons
    bankButtons.push([
      { text: "⬅️ Back", callback_data: "back_to_payout" },
      { text: "❌ Cancel", callback_data: "offramp_cancel" }
    ]);

    // Store bank mapping in session for later reference
    const bankMapping = {};
    supportedBanks.forEach(bank => {
      bankMapping[bank.name] = { code: bank.code, name: bank.name };
    });
    
    await offrampSessionService.updateSession(session.id, 'bank_selection', {
      ...session.data,
      payoutMethod: 'bank_account',
      currency: currency,
      bankMapping: bankMapping
    });

    return {
      text: `🏦 **USDC Withdrawal - Step 3 of 5**\n\n` +
            `💰 **Amount:** ${session.data.amount} USDC\n` +
            `💳 **Payout:** ${currencyFlag} Bank Account (${currency})\n\n` +
            `🏛️ **Select your bank:**`,
      reply_markup: {
        inline_keyboard: bankButtons
      }
    };

  } catch (error) {
    console.error('[handlePayoutMethodStep] Error:', error);
    return {
      text: "❌ An error occurred. Please try again."
    };
  }
}

// Handle bank selection step
async function handleBankSelectionStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const userInput = params.text?.trim();
    const callbackData = params.callback_data;
    
    // Handle callback data for back/cancel buttons
    if (callbackData === 'back_to_payout') {
      // Go back to payout method selection
      await offrampSessionService.updateSession(session.id, 'payout_method', {
        amount: session.data.amount,
        token: session.data.token
      });
      return handlePayoutMethodStep(session, { callback_data: undefined }, userId);
    }
    
    if (callbackData === 'offramp_cancel') {
      await offrampSessionService.clearSession(session.id);
      return {
        text: "❌ Withdrawal cancelled."
      };
    }
    
    // Handle bank selection from callback data
    if (callbackData && callbackData.startsWith('select_bank_')) {
      const parts = callbackData.split('_');
      if (parts.length >= 4) {
        const bankCode = parts[2];
        const bankName = parts.slice(3, -1).join('_'); // Handle bank names with underscores
        const currency = parts[parts.length - 1];
        const currencyFlag = currency === 'NGN' ? '🇳🇬' : '🇰🇪';
        
        // Update session with bank details and move to account number step
        await offrampSessionService.updateSession(session.id, 'account_number', {
          ...session.data,
          bankCode: bankCode,
          bankName: bankName,
          currency: currency
        });

        return {
          text: `🏦 **USDC Withdrawal - Step 4 of 5**\n\n` +
                `💰 **Amount:** ${session.data.amount} USDC\n` +
                `💳 **Payout:** ${currencyFlag} Bank Account (${currency})\n` +
                `🏛️ **Bank:** ${bankName}\n\n` +
                `🔢 **Please enter your account number:**\n\n` +
                `We'll automatically verify your account details.`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "⬅️ Back", callback_data: "back_to_banks" },
                { text: "❌ Cancel", callback_data: "offramp_cancel" }
              ]
            ]
          }
        };
      }
    }
    
    // If no valid callback data, return error
    return {
      text: "❌ Please select a bank from the options provided."
    };

  } catch (error) {
    console.error('[handleBankSelectionStep] Error:', error);
    return {
      text: "❌ An error occurred. Please try again."
    };
  }
}

// Handle account number input step
async function handleAccountNumberStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const accountNumber = params.text?.trim();
    
    if (params.callback_data === 'back_to_banks') {
      // Go back to bank selection
      const currency = session.data.currency || 'NGN';
      const currencyFlag = currency === 'NGN' ? '🇳🇬' : '🇰🇪';
      
      await offrampSessionService.updateSession(session.id, 'bank_selection', {
        ...session.data,
        payoutMethod: 'bank_account',
        currency: currency
      });
      
      // Get supported banks from Paycrest API
      const supportedBanks = await offrampService.getSupportedInstitutions(currency);

      if (supportedBanks.length === 0) {
        return {
          text: `❌ Unable to load banks for ${currency}. Please try again later.`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "⬅️ Back", callback_data: "back_to_payout" },
                { text: "❌ Cancel", callback_data: "offramp_cancel" }
              ]
            ]
          }
        };
      }

      const bankButtons = supportedBanks.map(bank => [
        { text: bank.name, callback_data: `select_bank_${bank.code}_${bank.name}_${currency}` }
      ]);

      bankButtons.push([
        { text: "⬅️ Back", callback_data: "back_to_payout" },
        { text: "❌ Cancel", callback_data: "offramp_cancel" }
      ]);

      return {
        text: `🏦 **USDC Withdrawal - Step 3 of 5**\n\n` +
              `💰 **Amount:** ${session.data.amount} USDC\n` +
              `💳 **Payout:** ${currencyFlag} Bank Account (${currency})\n\n` +
              `🏛️ **Select your bank:**`,
        reply_markup: {
          inline_keyboard: bankButtons
        }
      };
    }
    
    if (!accountNumber) {
      return {
        text: "❌ Please enter your account number.\n\nExample: 1234567890",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️ Back", callback_data: "back_to_banks" },
              { text: "❌ Cancel", callback_data: "offramp_cancel" }
            ]
          ]
        }
      };
    }

    // Validate account number format (10 digits for Nigerian banks)
    if (!/^\d{10}$/.test(accountNumber)) {
      return {
        text: "❌ Invalid account number format.\n\nPlease enter a 10-digit account number.\n\nExample: 1234567890",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️ Back", callback_data: "back_to_banks" },
              { text: "❌ Cancel", callback_data: "offramp_cancel" }
            ]
          ]
        }
      };
    }

    // Verify account with Paycrest API
     try {
       const accountDetails = await offrampService.verifyBankAccount(
         accountNumber,
         session.data.bankCode,
         'NGN'
       );

       if (!accountDetails || !accountDetails.isValid || !accountDetails.accountName) {
        return {
          text: "❌ Unable to verify account details.\n\nPlease check your account number and try again.",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "⬅️ Back", callback_data: "back_to_banks" },
                { text: "❌ Cancel", callback_data: "offramp_cancel" }
              ]
            ]
          }
        };
      }

      // Get exchange rate directly from Paycrest API
      let exchangeRate;
      let fiatAmount;
      
      try {
        // Use the offrampService to get exchange rates - this returns the actual rate per USDC
        const rates = await offrampService.getExchangeRates("USDC", 1); // Get rate for 1 USDC
        if (rates.NGN) {
          exchangeRate = rates.NGN; // This is the actual rate per USDC from Paycrest
          fiatAmount = exchangeRate * session.data.amount; // Calculate total fiat amount
          console.log(`[handleAccountNumberStep] Exchange rate from Paycrest: ₦${exchangeRate.toFixed(2)} per USDC`);
          console.log(`[handleAccountNumberStep] Calculated amount: ${session.data.amount} USDC = ₦${fiatAmount.toFixed(2)}`);
        } else {
          throw new Error('NGN rate not available');
        }
      } catch (error) {
        console.error('[handleAccountNumberStep] Could not fetch exchange rate:', error);
        return {
          text: "❌ We couldn't fetch the current exchange rate. Please try again in a moment.",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "⬅️ Back", callback_data: "back_to_banks" },
                { text: "❌ Cancel", callback_data: "offramp_cancel" }
              ]
            ]
          }
        };
      }

      const feeInUsdc = session.data.amount * 0.01; // 1% fee in USDC
      const feeInNaira = feeInUsdc * exchangeRate; // Convert fee to Naira for final amount calculation
      const finalAmount = fiatAmount - feeInNaira;

      // Update session with account details and move to confirmation
      await offrampSessionService.updateSession(session.id, 'confirmation', {
        ...session.data,
        accountNumber: accountNumber,
        accountName: accountDetails.accountName,
        exchangeRate: exchangeRate,
        fiatAmount: fiatAmount,
        fee: feeInUsdc, // Store fee in USDC
        finalAmount: finalAmount
      });

      return {
        text: `✅ **USDC Withdrawal - Step 5 of 5**\n\n` +
              `📋 **Transaction Summary:**\n\n` +
              `💰 **Amount:** ${session.data.amount} USDC\n` +
              `💱 **Rate:** ₦${exchangeRate.toFixed(2)} per USDC\n` +
              `💵 **Gross Amount:** ₦${fiatAmount.toLocaleString()}\n` +
              `💸 **Fee (1%):** ${feeInUsdc.toFixed(2)} USDC\n` +
              `💳 **Net Amount:** ₦${finalAmount.toLocaleString()}\n\n` +
              `🏛️ **Bank Details:**\n` +
              `• Bank: ${session.data.bankName}\n` +
              `• Account: ${accountNumber}\n` +
              `• Name: ${accountDetails.accountName}\n\n` +
              `⚠️ **Please confirm this transaction. This action cannot be undone.**`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Confirm Withdrawal", callback_data: "offramp_confirm" }
            ],
            [
              { text: "✏️ Edit Details", callback_data: "offramp_edit" },
              { text: "❌ Cancel", callback_data: "offramp_cancel" }
            ]
          ]
        }
      };

    } catch (error) {
      console.error('[handleAccountNumberStep] Account verification error:', error);
      return {
        text: "❌ Unable to verify account details.\n\nPlease check your account number and try again.",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⬅️ Back", callback_data: "back_to_banks" },
              { text: "❌ Cancel", callback_data: "offramp_cancel" }
            ]
          ]
        }
      };
    }

  } catch (error) {
    console.error('[handleAccountNumberStep] Error:', error);
    return {
      text: "❌ An error occurred. Please try again."
    };
  }
}

// Handle confirmation step
async function handleConfirmationStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    console.log(`[handleConfirmationStep] Called with callback_data: ${params.callback_data}`);
    console.log(`[handleConfirmationStep] Session data:`, JSON.stringify(session.data, null, 2));
    
    if (params.callback_data === 'offramp_confirm') {
      console.log(`[handleConfirmationStep] Processing offramp_confirm for user ${userId}`);
      
      // First, create the Paycrest order to get the receive address
      try {
        const result = await offrampService.prepareOfframp({
          userId,
          amount: session.data.amount,
          token: 'USDC',
          currency: 'NGN',
          bankDetails: {
            accountNumber: session.data.accountNumber,
            bankName: session.data.bankName,
            bankCode: session.data.bankCode,
            accountName: session.data.accountName,
          },
        });

        console.log(`[handleConfirmationStep] prepareOfframp result:`, JSON.stringify(result, null, 2));

        // Store the order details in session for final confirmation
        await offrampSessionService.updateSession(session.id, 'final_confirmation', {
          ...session.data,
          orderId: result.orderId,
          receiveAddress: result.receiveAddress,
          fiatAmount: result.fiatAmount,
        });

        // Show final confirmation with receive address
        return {
          text: `🔐 **Final Confirmation Required**\n\n` +
                `You are about to transfer **${session.data.amount} USDC** to:\n` +
                `📍 **Receive Address:** \`${result.receiveAddress}\`\n\n` +
                `💰 **You will receive:** ${result.fiatAmount} ${session.data.currency}\n` +
                `🏦 **Bank Account:** ${session.data.accountName} (${session.data.accountNumber})\n\n` +
                `⚠️ **This action cannot be undone. Please verify the receive address carefully.**\n\n` +
                `Do you want to proceed with the token transfer?`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Yes, Transfer Tokens", callback_data: "offramp_final_confirm" },
                { text: "❌ Cancel", callback_data: "offramp_cancel" }
              ]
            ]
          }
        };
      } catch (error) {
        console.error('[handleConfirmationStep] Error preparing off-ramp:', error);
        return {
          text: `❌ An error occurred while preparing your transaction: ${error.message}`
        };
      }
    }

    if (params.callback_data === 'offramp_cancel') {
      await offrampSessionService.clearSession(session.id);
      return {
        text: "❌ Withdrawal cancelled. You can start a new withdrawal anytime by typing 'offramp'.",
      };
    }

    if (params.callback_data === 'offramp_edit') {
      // Go back to amount step
      await offrampSessionService.updateSession(session.id, 'amount', {});
      return await startOfframpFlow(userId);
    }

    // For any other case, show error message
    return {
      text: "❌ Please use the buttons to confirm or cancel your withdrawal.",
    };
  } catch (error) {
    console.error('[handleConfirmationStep] Error:', error);
    return {
      text: "❌ An error occurred. Please try again.",
    };
  }
}

// Handle final confirmation step
async function handleFinalConfirmationStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    console.log(`[handleFinalConfirmationStep] Called with callback_data: ${params.callback_data}`);
    console.log(`[handleFinalConfirmationStep] Session data:`, JSON.stringify(session.data, null, 2));
    
    if (params.callback_data === 'offramp_final_confirm') {
      console.log(`[handleFinalConfirmationStep] Processing final confirmation for user ${userId}`);
      
      // Validate session before updating
      if (!session || !session.id) {
        console.error('[handleFinalConfirmationStep] Invalid session object:', session);
        throw new Error('Invalid session - cannot proceed with order creation');
      }
      
      // Update session to show order creation in progress
      await offrampSessionService.updateSession(session.id, 'creating_order', {
        ...session.data,
        status: 'creating_order',
      });

      // Execute the offramp using the new Paycrest Sender API flow
      try {
        // Step 1: Create order via Paycrest Sender API
        const offrampRequest = {
          userId,
          amount: session.data.amount,
          currency: session.data.currency,
          token: 'USDC',
          bankDetails: {
            accountNumber: session.data.accountNumber,
            bankCode: session.data.bankCode,
            accountName: session.data.accountName,
            bankName: session.data.bankName || 'Unknown Bank'
          }
        };

        const orderResult = await offrampService.processTelegramOfframp(offrampRequest);

        console.log(`[handleFinalConfirmationStep] Order created:`, JSON.stringify(orderResult, null, 2));

        // Update session with order details and move to token transfer confirmation
        if (!session || !session.id) {
          console.error('[handleFinalConfirmationStep] Invalid session object for order update:', session);
          throw new Error('Invalid session - cannot update with order details');
        }
        
        // Validate and format expectedAmount to prevent NaN display
        const expectedAmount = orderResult.expectedAmount || session.data.amount || 0;
        const expectedAmountStr = typeof expectedAmount === 'number' ? expectedAmount.toString() : expectedAmount;
        const expectedAmountNum = parseFloat(expectedAmountStr);
        
        // Ensure we have valid numbers for calculations
        const validExpectedAmount = !isNaN(expectedAmountNum) && expectedAmountNum > 0 ? expectedAmountNum : session.data.amount;

        await offrampSessionService.updateSession(session.id, 'awaiting_transfer', {
          ...session.data,
          orderId: orderResult.orderId,
          receiveAddress: orderResult.receiveAddress,
          expectedAmount: validExpectedAmount.toString(),
          status: 'awaiting_transfer',
          createdAt: new Date().toISOString(),
          lastStatusCheck: new Date().toISOString()
        });

        // Start monitoring order status
        setTimeout(() => {
          monitorOrderStatus(orderResult.orderId, userId, session.id);
        }, 30000); // Start monitoring after 30 seconds
        const validExchangeRate = session.exchange_rate || 1;
        const nairaAmount = (validExpectedAmount * validExchangeRate).toLocaleString();

        // Show user the enhanced processing message with status monitoring info
        return {
          text: `🔄 **Processing Your Withdrawal**\n\n` +
                `✅ **Order Created Successfully!**\n\n` +
                `💰 **Sending:** ${validExpectedAmount} USDC\n` +
                `💵 **You'll Receive:** ₦${nairaAmount}\n` +
                `📋 **Order ID:** ${orderResult.orderId}\n\n` +
                `🔍 **What's happening:**\n` +
                `• Your USDC is being transferred to Paycrest\n` +
                `• Order is being processed by our partner\n` +
                `• Funds will be delivered to your bank account\n\n` +
                `⏰ **Expected completion:** 5-15 minutes\n` +
                `📱 **You'll receive real-time updates on progress**\n\n` +
                `💡 Once completed, funds arrive in your account within 2 minutes!`,
          metadata: { 
            orderId: orderResult.orderId, 
            receiveAddress: orderResult.receiveAddress,
            expectedAmount: validExpectedAmount.toString(),
            step: 'awaiting_transfer' 
          }
        };
      } catch (error) {
        console.error('[handleFinalConfirmationStep] Error creating order:', error);
        
        // Check for specific error types
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Update the session to reflect the error
        if (session && session.id) {
          await offrampSessionService.updateSession(session.id, 'completed', {
            ...session.data,
            status: 'error',
            error: errorMessage,
          });
        } else {
          console.error('[handleFinalConfirmationStep] Cannot update session with error - invalid session:', session);
        }
        
        return {
          text: `❌ An error occurred while creating your order: ${errorMessage}\n\n` +
                `Please try again or contact support if the issue persists.`
        };
      }
    }

    if (params.callback_data === 'offramp_send_tokens') {
      console.log(`[handleFinalConfirmationStep] Processing token transfer for user ${userId}`);
      
      // Update session to show transfer in progress
      await offrampSessionService.updateSession(session.id, 'processing', {
        ...session.data,
        status: 'transferring_tokens',
      });

      try {
        // Execute the token transfer
        const transferRequest = {
          userId,
          orderId: session.data.orderId,
          receiveAddress: session.data.receiveAddress,
          amount: session.data.expectedAmount,
          token: 'USDC'
        };

        const transferResult = await offrampService.executeTokenTransfer(transferRequest);

        console.log(`[handleFinalConfirmationStep] Token transfer completed:`, JSON.stringify(transferResult, null, 2));

        // Update session with transfer details
        await offrampSessionService.updateSession(session.id, 'completed', {
          ...session.data,
          transactionHash: transferResult.transactionHash,
          status: 'transfer_completed',
        });

        // Start monitoring the order status
        setTimeout(async () => {
          try {
            await offrampService.monitorOrderStatus(session.data.orderId);
          } catch (monitorError) {
            console.error('[handleFinalConfirmationStep] Error monitoring order:', monitorError);
          }
        }, 5000); // Start monitoring after 5 seconds

        return {
          text: `✅ **Tokens Sent Successfully!**\n\n` +
                `📋 **Order ID:** ${session.data.orderId}\n` +
                `🔗 **Transaction Hash:** ${transferResult.transactionHash}\n\n` +
                `🔄 Your withdrawal is now being processed by Paycrest. ` +
                `You will receive updates as the status changes.\n\n` +
                `💡 **Tip:** You can check the status anytime by typing 'status'.`,
          metadata: { 
            orderId: session.data.orderId, 
            txHash: transferResult.transactionHash, 
            step: 'transfer_completed' 
          }
        };
      } catch (error) {
        console.error('[handleFinalConfirmationStep] Error executing token transfer:', error);
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Update the session to reflect the error
        await offrampSessionService.updateSession(session.id, 'completed', {
          ...session.data,
          status: 'transfer_error',
          error: errorMessage,
        });
        
        // Handle insufficient ETH balance error
        if (errorMessage.toLowerCase().includes('insufficient') && 
            (errorMessage.toLowerCase().includes('eth') || errorMessage.toLowerCase().includes('gas'))) {
          return {
            text: `❌ Insufficient ETH balance for gas fees.\n\n` +
                  `You need ETH in your wallet to pay for transaction fees when sending USDC. ` +
                  `Please add some ETH to your wallet and try again.\n\n` +
                  `💡 **Tip:** Even small amounts of ETH (like $1-2 worth) are usually sufficient for gas fees.`
          };
        }
        
        return {
          text: `❌ An error occurred while sending tokens: ${errorMessage}\n\n` +
                `Your order (${session.data.orderId}) is still active. ` +
                `Please try the transfer again or contact support.`
        };
      }
    }

    if (params.callback_data === 'offramp_cancel') {
      await offrampSessionService.clearSession(session.id);
      return {
        text: "❌ Withdrawal cancelled. You can start a new withdrawal anytime by typing 'offramp'.",
      };
    }

    // For any other case, show error message
    return {
      text: "❌ Please use the buttons to confirm or cancel your withdrawal.",
    };
  } catch (error) {
    console.error('[handleFinalConfirmationStep] Error:', error);
    return {
      text: "❌ An error occurred. Please try again.",
    };
  }
}

async function handleOfframpSubmit(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    console.log('[handleOfframpSubmit] Called with params:', params);
    
    // Get the active offramp session
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }

    const session = await offrampSessionService.getActiveSession(actualUserId);
    if (!session) {
      return {
        text: "❌ No active withdrawal session found. Please start a new withdrawal.",
      };
    }

    // Route to the final confirmation step
    return await handleFinalConfirmationStep(session, { callback_data: 'offramp_final_confirm' }, actualUserId);
  } catch (error) {
    console.error('[handleOfframpSubmit] error', error);
    return {
      text: 'An error occurred while submitting your transaction. Please try again.',
    };
  }
}

// Handle KYC verification intent
async function handleKYCVerification(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }

    // Check current KYC status
    const { data: kycData } = await supabase
      .from('user_kyc')
      .select('status, paycrest_customer_id, created_at')
      .eq('user_id', actualUserId)
      .single();

    if (kycData) {
      switch (kycData.status) {
        case 'approved':
          return {
            text: "✅ **KYC Verification Complete**\n\n" +
                  "Your identity has been verified successfully.\n" +
                  "You can now withdraw crypto to your bank account.",
            reply_markup: {
              inline_keyboard: [
                [{ text: "💱 Start Withdrawal", callback_data: "start_offramp" }]
              ]
            }
          };
        
        case 'pending':
          return {
            text: "⏳ **KYC Verification Pending**\n\n" +
                  "Your KYC verification is being reviewed.\n" +
                  "This usually takes 1-3 business days.\n\n" +
                  `Submitted: ${new Date(kycData.created_at).toLocaleDateString()}`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Check Status", callback_data: "check_kyc_status" }]
              ]
            }
          };
        
        case 'rejected':
          return {
            text: "❌ **KYC Verification Rejected**\n\n" +
                  "Your previous KYC submission was rejected.\n" +
                  "Please contact support or try again with updated documents.",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Retry KYC", callback_data: "start_kyc" }],
                [{ text: "💬 Contact Support", callback_data: "contact_support" }]
              ]
            }
          };
      }
    }

    // No KYC record found, show start KYC option
    return {
      text: "🔐 **KYC Verification Required**\n\n" +
            "To withdraw crypto to your bank account, you need to complete identity verification.\n\n" +
            "**What you'll need:**\n" +
            "• Government-issued ID\n" +
            "• Proof of address\n" +
            "• Bank account details\n\n" +
            "**Process takes:** 1-3 business days\n" +
            "**Supported countries:** Nigeria, Kenya",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔐 Start KYC Verification", callback_data: "start_kyc" }],
          [{ text: "❓ Learn More", callback_data: "kyc_info" }]
        ]
      }
    };
  } catch (error) {
    console.error('[handleKYCVerification] Error:', error);
    return {
      text: "❌ Failed to check KYC status. Please try again later.",
    };
  }
}

// Handle offramp transaction history
async function handleOfframpHistory(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }

    const transactions = await offrampService.getTransactionHistory(actualUserId);
    const stats = await offrampService.getTransactionStats(actualUserId);

    if (transactions.length === 0) {
      return {
        text: "📊 **Transaction History**\n\n" +
              "No withdrawal transactions found.\n\n" +
              "Start your first withdrawal by typing 'withdraw' or 'offramp'.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 Start Withdrawal", callback_data: "offramp" }]
          ]
        }
      };
    }

    let historyText = `📊 **Transaction History**\n\n`;
    historyText += `**Summary:**\n`;
    historyText += `• Total: ${stats.total} transactions\n`;
    historyText += `• Completed: ${stats.completed}\n`;
    historyText += `• Pending: ${stats.pending}\n`;
    historyText += `• Failed: ${stats.failed}\n`;
    historyText += `• Total Amount: ${stats.totalAmount.toFixed(2)}\n\n`;

    historyText += `**Recent Transactions:**\n`;
    
    const recentTransactions = transactions.slice(0, 5);
    for (const tx of recentTransactions) {
      const statusEmoji = {
        'completed': '✅',
        'processing': '🔄',
        'pending': '⏳',
        'failed': '❌'
      }[tx.status] || '❓';

      const date = tx.createdAt.toLocaleDateString();
      const txId = tx.id.substring(0, 8);
      
      historyText += `${statusEmoji} ${tx.fiatAmount} ${tx.fiatCurrency} - ${date}\n`;
      historyText += `   ID: ${txId} | ${tx.status.toUpperCase()}\n`;
      
      if (tx.status === 'failed' && tx.errorMessage) {
        historyText += `   Error: ${tx.errorMessage}\n`;
      }
      historyText += `\n`;
    }

    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
    
    // Add retry button for failed transactions
    const failedTx = transactions.find(tx => tx.status === 'failed');
    if (failedTx) {
      keyboard.push([{ text: "🔄 Retry Failed Transaction", callback_data: `retry_tx_${failedTx.id}` }]);
    }
    
    keyboard.push([{ text: "💰 New Withdrawal", callback_data: "offramp" }]);

    return {
      text: historyText,
      reply_markup: {
        inline_keyboard: keyboard
      }
    };
  } catch (error) {
    console.error('[handleOfframpHistory] Error:', error);
    return {
      text: "❌ Failed to fetch transaction history. Please try again later.",
    };
  }
}

// Handle transaction retry with enhanced error handling
async function handleRetryTransaction(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ **Access Denied**\n\nUser not found. Please make sure you're registered with the bot.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Register", url: "https://t.me/HedwigAssistBot" }]
          ]
        }
      };
    }

    const transactionId = params.transaction_id;
    if (!transactionId) {
      return {
        text: "❌ **Invalid Request**\n\nTransaction ID is required for retry. Please select a transaction from your history.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    }

    // First check if transaction exists and is retryable
    const existingTx = await offrampService.checkTransactionStatus(transactionId);
    if (!existingTx) {
      return {
        text: "❌ **Transaction Not Found**\n\nThe transaction you're trying to retry doesn't exist or you don't have permission to access it.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    }

    if (existingTx.status !== 'failed') {
      const statusText = {
        'completed': 'already completed',
        'processing': 'currently processing',
        'pending': 'still pending'
      }[existingTx.status] || 'in an unknown state';
      
      return {
        text: `⚠️ **Cannot Retry Transaction**\n\nThis transaction is ${statusText} and cannot be retried.\n\nOnly failed transactions can be retried.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Check Status", callback_data: `tx_status_${transactionId}` }],
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    }

    const result = await offrampService.retryTransaction(transactionId);
    
    if (result) {
      return {
        text: `🔄 **Transaction Retry Successful**\n\n` +
              `✅ Your failed transaction has been resubmitted\n\n` +
              `**Details:**\n` +
              `• Transaction ID: ${result.id.substring(0, 8)}\n` +
              `• Amount: ${result.fiatAmount} ${result.fiatCurrency}\n` +
              `• Status: Processing\n\n` +
              `📱 You'll receive notifications as your transaction progresses.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Track Progress", callback_data: `tx_status_${result.id}` }],
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    } else {
      return {
        text: "❌ **Retry Failed**\n\n" +
              "Unable to retry the transaction at this time. This could be due to:\n\n" +
              "• Temporary service issues\n" +
              "• Invalid transaction state\n" +
              "• Network connectivity problems\n\n" +
              "Please try again in a few minutes or contact support if the issue persists.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Try Again", callback_data: `retry_tx_${transactionId}` }],
            [{ text: "📊 View History", callback_data: "offramp_history" }],
            [{ text: "💬 Contact Support", url: "https://t.me/hedwig_support" }]
          ]
        }
      };
    }
  } catch (error) {
    console.error('[handleRetryTransaction] Error:', error);
    
    // Provide specific error messages based on error type
    let errorMessage = "❌ **Retry Failed**\n\n";
    
    if (error.message?.includes('Service temporarily')) {
      errorMessage += "Our services are temporarily unavailable. Please try again in a few minutes.";
    } else if (error.message?.includes('Network')) {
      errorMessage += "Network connectivity issues detected. Please check your connection and try again.";
    } else if (error.message?.includes('KYC')) {
      errorMessage += "Your KYC verification has expired. Please complete verification again.";
    } else {
      errorMessage += "An unexpected error occurred. Please try again or contact support if the issue persists.";
    }
    
    return {
      text: errorMessage,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Try Again", callback_data: `retry_tx_${params.transaction_id || 'unknown'}` }],
          [{ text: "📊 View History", callback_data: "offramp_history" }],
          [{ text: "💬 Contact Support", url: "https://t.me/hedwig_support" }]
        ]
      }
    };
  }
}

// Handle transaction cancellation with enhanced error handling
async function handleCancelTransaction(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ **Access Denied**\n\nUser not found. Please make sure you're registered with the bot.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Register", url: "https://t.me/HedwigAssistBot" }]
          ]
        }
      };
    }

    const transactionId = params.transaction_id;
    if (!transactionId) {
      return {
        text: "❌ **Invalid Request**\n\nTransaction ID is required for cancellation. Please select a transaction from your history.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    }

    // First check if transaction exists and is cancellable
    const existingTx = await offrampService.checkTransactionStatus(transactionId);
    if (!existingTx) {
      return {
        text: "❌ **Transaction Not Found**\n\nThe transaction you're trying to cancel doesn't exist or you don't have permission to access it.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    }

    if (existingTx.status !== 'pending') {
      const statusText = {
        'completed': 'already completed',
        'processing': 'currently processing',
        'failed': 'already failed'
      }[existingTx.status] || 'in an unknown state';
      
      return {
        text: `⚠️ **Cannot Cancel Transaction**\n\nThis transaction is ${statusText} and cannot be cancelled.\n\nOnly pending transactions can be cancelled before processing begins.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Check Status", callback_data: `tx_status_${transactionId}` }],
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    }

    const success = await offrampService.cancelTransaction(transactionId);
    
    if (success) {
      return {
        text: `✅ **Transaction Cancelled Successfully**\n\n` +
              `🚫 Your pending withdrawal has been cancelled\n\n` +
              `**Details:**\n` +
              `• Transaction ID: ${transactionId.substring(0, 8)}\n` +
              `• Amount: ${existingTx.fiatAmount} ${existingTx.fiatCurrency}\n` +
              `• Status: Cancelled\n\n` +
              `💡 You can start a new withdrawal anytime.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 New Withdrawal", callback_data: "offramp" }],
            [{ text: "📊 View History", callback_data: "offramp_history" }]
          ]
        }
      };
    } else {
      return {
        text: "❌ **Cancellation Failed**\n\n" +
              "Unable to cancel the transaction at this time. This could be due to:\n\n" +
              "• Transaction has already started processing\n" +
              "• Temporary service issues\n" +
              "• Network connectivity problems\n\n" +
              "Please check the transaction status or contact support.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Check Status", callback_data: `tx_status_${transactionId}` }],
            [{ text: "📊 View History", callback_data: "offramp_history" }],
            [{ text: "💬 Contact Support", url: "https://t.me/hedwig_support" }]
          ]
        }
      };
    }
  } catch (error) {
    console.error('[handleCancelTransaction] Error:', error);
    
    // Provide specific error messages based on error type
    let errorMessage = "❌ **Cancellation Failed**\n\n";
    
    if (error.message?.includes('Service temporarily')) {
      errorMessage += "Our services are temporarily unavailable. Please try again in a few minutes.";
    } else if (error.message?.includes('Network')) {
      errorMessage += "Network connectivity issues detected. Please check your connection and try again.";
    } else if (error.message?.includes('already processing')) {
      errorMessage += "This transaction has already started processing and cannot be cancelled.";
    } else {
      errorMessage += "An unexpected error occurred. Please try again or contact support if the issue persists.";
    }
    
    return {
      text: errorMessage,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Check Status", callback_data: `tx_status_${params.transaction_id || 'unknown'}` }],
          [{ text: "📊 View History", callback_data: "offramp_history" }],
          [{ text: "💬 Contact Support", url: "https://t.me/hedwig_support" }]
        ]
      }
    };
  }
}

// Handle transaction status check
async function handleTransactionStatus(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "❌ User not found. Please make sure you're registered with the bot.",
      };
    }

    const transactionId = params.transaction_id;
    if (!transactionId) {
      return {
        text: "❌ Transaction ID is required for status check.",
      };
    }

    const transaction = await offrampService.checkTransactionStatus(transactionId);
    
    if (!transaction) {
      return {
        text: "❌ Transaction not found or you don't have permission to view it.",
      };
    }

    const statusEmoji = {
      'completed': '✅',
      'processing': '🔄',
      'pending': '⏳',
      'failed': '❌'
    }[transaction.status] || '❓';

    let statusText = `${statusEmoji} **Transaction Status**\n\n`;
    statusText += `**Transaction ID:** ${transaction.id.substring(0, 8)}\n`;
    statusText += `**Amount:** ${transaction.amount} ${transaction.token}\n`;
    statusText += `**Fiat Amount:** ${transaction.fiatAmount} ${transaction.fiatCurrency}\n`;
    statusText += `**Status:** ${transaction.status.toUpperCase()}\n`;
    statusText += `**Created:** ${transaction.createdAt.toLocaleDateString()}\n`;
    statusText += `**Updated:** ${transaction.updatedAt.toLocaleDateString()}\n`;
    
    if (transaction.txHash) {
      statusText += `**Blockchain TX:** ${transaction.txHash.substring(0, 10)}...\n`;
    }
    
    if (transaction.errorMessage) {
      statusText += `**Error:** ${transaction.errorMessage}\n`;
    }

    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
    
    if (transaction.status === 'failed') {
      keyboard.push([{ text: "🔄 Retry Transaction", callback_data: `retry_tx_${transaction.id}` }]);
    }
    
    if (transaction.status === 'pending') {
      keyboard.push([{ text: "❌ Cancel Transaction", callback_data: `cancel_tx_${transaction.id}` }]);
    }
    
    keyboard.push([{ text: "📊 View History", callback_data: "offramp_history" }]);

    return {
      text: statusText,
      reply_markup: {
        inline_keyboard: keyboard
      }
    };
  } catch (error) {
    console.error('[handleTransactionStatus] Error:', error);
    return {
      text: "❌ Failed to check transaction status. Please try again later.",
    };
  }
}

/**
 * Monitor Paycrest order status and handle state transitions
 */
async function monitorOrderStatus(orderId: string, userId: string, sessionId: string, attempt: number = 1): Promise<void> {
  const MAX_ATTEMPTS = 20; // Monitor for ~10 minutes (30s intervals)
  const RETRY_INTERVAL = 30000; // 30 seconds
  
  try {
    console.log(`[monitorOrderStatus] Checking status for order ${orderId}, attempt ${attempt}`);
    
    // Get order status from Paycrest
    const statusResponse = await serverPaycrestService.getOrderStatus(orderId);
    
    if (!statusResponse || !statusResponse.data) {
      throw new Error('Invalid status response from Paycrest');
    }
    
    const { status, transactionHash } = statusResponse.data;
    console.log(`[monitorOrderStatus] Order ${orderId} status: ${status}`);
    
    // Update session with latest status
    const session = await offrampSessionService.getSessionById(sessionId);
    if (session) {
      await offrampSessionService.updateSession(sessionId, session.step, {
        ...session.data,
        status,
        transactionHash,
        lastStatusCheck: new Date().toISOString()
      });
    }
    
    // Handle different status states
    switch (status.toLowerCase()) {
      case 'completed':
      case 'fulfilled':
      case 'success':
        await handleSuccessfulWithdrawal(userId, orderId, statusResponse.data);
        return; // Stop monitoring
        
      case 'failed':
      case 'error':
      case 'cancelled':
        await handleFailedWithdrawal(userId, orderId, statusResponse.data);
        return; // Stop monitoring
        
      case 'refunded':
      case 'refund_pending':
        await handleRefundNotification(userId, orderId, statusResponse.data);
        return; // Stop monitoring
        
      case 'pending':
      case 'processing':
      case 'awaiting_transfer':
        // Continue monitoring
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => {
            monitorOrderStatus(orderId, userId, sessionId, attempt + 1);
          }, RETRY_INTERVAL);
        } else {
          // Max attempts reached, notify user of timeout
          await handleMonitoringTimeout(userId, orderId);
        }
        break;
        
      default:
        console.warn(`[monitorOrderStatus] Unknown status: ${status}`);
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => {
            monitorOrderStatus(orderId, userId, sessionId, attempt + 1);
          }, RETRY_INTERVAL);
        }
    }
    
  } catch (error) {
    console.error(`[monitorOrderStatus] Error monitoring order ${orderId}:`, error);
    
    // Retry on error (network issues, etc.)
    if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => {
        monitorOrderStatus(orderId, userId, sessionId, attempt + 1);
      }, RETRY_INTERVAL);
    } else {
      await handleMonitoringError(userId, orderId, error);
    }
  }
}

/**
 * Handle successful withdrawal completion
 */
async function handleSuccessfulWithdrawal(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const message = {
      text: `✅ **Withdrawal Successful!**\n\n` +
            `🎉 Your withdrawal has been completed successfully!\n\n` +
            `💰 **Amount:** ${orderData.expectedAmount || orderData.amount} USDC\n` +
            `🏦 **Status:** Funds delivered to your bank account\n` +
            `⏰ **Completion Time:** ${new Date().toLocaleString()}\n\n` +
            `💡 **Your funds should appear in your account within the next 2 minutes.**\n\n` +
            `Thank you for using Hedwig! 🚀`,
      reply_markup: {
        inline_keyboard: [[
          { text: "📊 View History", callback_data: "offramp_history" },
          { text: "💸 New Withdrawal", callback_data: "start_offramp" }
        ]]
      }
    };
    
    await sendTelegramMessage(userId, message);
    
    // Update database record
    await supabase
      .from('offramp_transactions')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        transaction_hash: orderData.transactionHash
      })
      .eq('paycrest_order_id', orderId);
      
  } catch (error) {
    console.error('[handleSuccessfulWithdrawal] Error:', error);
  }
}

/**
 * Handle failed withdrawal
 */
async function handleFailedWithdrawal(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const message = {
      text: `❌ **Withdrawal Failed**\n\n` +
            `We're sorry, but your withdrawal could not be completed.\n\n` +
            `💰 **Amount:** ${orderData.expectedAmount || orderData.amount} USDC\n` +
            `📋 **Order ID:** ${orderId}\n` +
            `⏰ **Failed At:** ${new Date().toLocaleString()}\n\n` +
            `🔄 **What happens next:**\n` +
            `• Your funds will be automatically refunded\n` +
            `• Refund typically takes 5-10 minutes\n` +
            `• You'll receive a notification when refund is complete\n\n` +
            `💬 Need help? Contact our support team.`,
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Try Again", callback_data: "start_offramp" },
          { text: "💬 Contact Support", callback_data: "contact_support" }
        ]]
      }
    };
    
    await sendTelegramMessage(userId, message);
    
    // Update database record
    await supabase
      .from('offramp_transactions')
      .update({ 
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_reason: orderData.failureReason || 'Transaction failed'
      })
      .eq('paycrest_order_id', orderId);
      
  } catch (error) {
    console.error('[handleFailedWithdrawal] Error:', error);
  }
}

/**
 * Handle refund notification
 */
async function handleRefundNotification(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const message = {
      text: `🔄 **Refund Processed**\n\n` +
            `Your withdrawal has been refunded successfully.\n\n` +
            `💰 **Refunded Amount:** ${orderData.expectedAmount || orderData.amount} USDC\n` +
            `📋 **Order ID:** ${orderId}\n` +
            `⏰ **Refunded At:** ${new Date().toLocaleString()}\n\n` +
            `✅ **Your USDC has been returned to your wallet.**\n\n` +
            `You can try the withdrawal again or contact support if you need assistance.`,
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Try Again", callback_data: "start_offramp" },
          { text: "💬 Contact Support", callback_data: "contact_support" }
        ]]
      }
    };
    
    await sendTelegramMessage(userId, message);
    
    // Update database record
    await supabase
      .from('offramp_transactions')
      .update({ 
        status: 'refunded',
        refunded_at: new Date().toISOString()
      })
      .eq('paycrest_order_id', orderId);
      
  } catch (error) {
    console.error('[handleRefundNotification] Error:', error);
  }
}

/**
 * Handle monitoring timeout
 */
async function handleMonitoringTimeout(userId: string, orderId: string): Promise<void> {
  try {
    const message = {
      text: `⏰ **Withdrawal Status Update**\n\n` +
            `Your withdrawal is taking longer than expected to process.\n\n` +
            `📋 **Order ID:** ${orderId}\n` +
            `⏰ **Status:** Still processing\n\n` +
            `🔍 **What's happening:**\n` +
            `• Your transaction is still being processed\n` +
            `• This can take up to 24 hours in some cases\n` +
            `• You'll be notified once it's complete\n\n` +
            `💬 Contact support if you have concerns.`,
      reply_markup: {
        inline_keyboard: [[
          { text: "🔍 Check Status", callback_data: `check_status_${orderId}` },
          { text: "💬 Contact Support", callback_data: "contact_support" }
        ]]
      }
    };
    
    await sendTelegramMessage(userId, message);
  } catch (error) {
    console.error('[handleMonitoringTimeout] Error:', error);
  }
}

/**
 * Handle monitoring error
 */
async function handleMonitoringError(userId: string, orderId: string, error: any): Promise<void> {
  try {
    const message = {
      text: `⚠️ **Status Check Error**\n\n` +
            `We encountered an issue checking your withdrawal status.\n\n` +
            `📋 **Order ID:** ${orderId}\n` +
            `⏰ **Time:** ${new Date().toLocaleString()}\n\n` +
            `🔄 **Your withdrawal is likely still processing.**\n` +
            `Please check back later or contact support.`,
      reply_markup: {
        inline_keyboard: [[
          { text: "🔍 Check Status", callback_data: `check_status_${orderId}` },
          { text: "💬 Contact Support", callback_data: "contact_support" }
        ]]
      }
    };
    
    await sendTelegramMessage(userId, message);
  } catch (error) {
    console.error('[handleMonitoringError] Error:', error);
  }
}

/**
 * Send Telegram message helper
 */
async function sendTelegramMessage(userId: string, message: any): Promise<void> {
  try {
    // Get user's chat ID from database
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', userId)
      .single();
      
    if (user?.telegram_chat_id) {
      const telegramBot = require('../lib/telegramBot');
      await telegramBot.sendMessage(user.telegram_chat_id, message.text, {
        parse_mode: 'Markdown',
        reply_markup: message.reply_markup
      });
    }
  } catch (error) {
    console.error('[sendTelegramMessage] Error:', error);
  }
}

// Export for external use
export { handleGetWalletBalance, handleGetWalletAddress, handleDepositNotification, sendManualReminder, handleOfframp, handleKYCVerification, handleOfframpHistory, handleRetryTransaction, handleCancelTransaction, handleTransactionStatus };
