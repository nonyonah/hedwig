import { getOrCreateCdpWallet, createWallet, getTransaction, getBalances, transferNativeToken, transferToken, estimateTransactionFee, getBlockExplorerUrl } from "@/lib/cdp";
import { createClient } from "@supabase/supabase-js";
import { getEarningsSummary, getSpendingSummary, formatEarningsForAgent } from '../lib/earningsService';
import { getTokenPricesBySymbol, TokenPrice } from '../lib/tokenPriceService';
// Proposal service imports removed - using new module system

import fetch from "node-fetch";
import { formatUnits } from "viem";
import { formatAddress, formatBalance } from "@/lib/utils";
import { handleCurrencyConversion } from "@/lib/currencyConversionService";
import crypto from "crypto";

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

// Core wallet functions
async function handleCreateWallets(userId: string) {
  try {
    console.log(`[handleCreateWallets] Creating wallets for user: ${userId}`);
    
    // Create EVM wallet (Base Sepolia)
    const evmWallet = await createWallet(userId, 'evm');
    console.log(`[handleCreateWallets] EVM wallet created:`, evmWallet);
    
    // Create Solana wallet
    const solanaWallet = await createWallet(userId, 'solana');
    console.log(`[handleCreateWallets] Solana wallet created:`, solanaWallet);
    
    return {
      text: `🎉 **Wallets Created Successfully!**\n\n` +
            `🔹 **Base Wallet**: ${formatAddress(evmWallet.address)}\n` +
            `🔹 **Solana Wallet**: ${formatAddress(solanaWallet.address)}\n\n` +
            `Your wallets are ready! You can now:\n` +
            `• Check your balance\n` +
            `• Send and receive crypto\n` +
            `• Swap tokens\n\n` +
            `Type "balance" to see your current balances.`
    };
  } catch (error) {
    console.error('[handleCreateWallets] Error:', error);
    return {
      text: "❌ Failed to create wallets. Please try again later."
    };
  }
}

async function handleGetWalletBalance(params: ActionParams, userId: string): Promise<ActionResult> {
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
        .eq('telegram_username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[handleGetWalletBalance] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      actualUserId = user.id;
    }

    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);

    if (!wallets || wallets.length === 0) {
      return {
        text: "You don't have any wallets yet. Type 'create wallet' to get started!"
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
        // Get balances for testnet networks (base-sepolia only - Ethereum disabled)
        const supportedEvmNetworks = ['base-sepolia'];
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
            'base': 'base-sepolia'
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
        const balances = await getBalances(solanaWallet.address, 'solana-devnet');
        
        let solAmount = '0';
        let usdcAmount = '0';
        
        if (Array.isArray(balances)) {
          // New format from getSolanaBalances function
          const solToken = balances.find((b: any) => b.asset?.symbol === 'SOL');
          const usdcToken = balances.find((b: any) => b.asset?.symbol === 'USDC');
          
          if (solToken) {
            // SOL balance is already in lamports, convert to SOL
            solAmount = formatBalance(solToken.amount, solToken.asset.decimals);
          }
          
          if (usdcToken) {
            // USDC balance from SPL token
            usdcAmount = formatBalance(usdcToken.amount, usdcToken.asset.decimals);
          }
        }
        
        // Get token prices for USD conversion
        let tokenPrices: any = {};
        try {
          const prices = await getTokenPricesBySymbol(['SOL', 'USDC']);
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
        
        let solDisplay = `${solBalanceNum.toFixed(4)} SOL`;
        let usdcDisplay = `${usdcBalanceNum.toFixed(2)} USDC`;
        
        if (tokenPrices.SOL && solBalanceNum > 0) {
          const solUsd = (solBalanceNum * tokenPrices.SOL).toFixed(2);
          solDisplay += ` ($${solUsd})`;
        }
        
        if (tokenPrices.USDC && usdcBalanceNum > 0) {
          const usdcUsd = (usdcBalanceNum * tokenPrices.USDC).toFixed(2);
          usdcDisplay += ` ($${usdcUsd})`;
        }
        
        solanaBalances = `🌸 **Solana**\n• ${usdcDisplay}\n• ${solDisplay}\n\n`;
      } catch (balanceError) {
        console.error(`[handleGetWalletBalance] Error fetching Solana balances:`, balanceError);
        solanaBalances = `🌸 **Solana**\n• Error fetching USDC\n• Error fetching SOL\n\n`;
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
        response = "❌ No wallets found. Type 'create wallet' to get started!";
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
        .eq('telegram_username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[handleGetWalletAddress] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }
      
      actualUserId = user.id;
    }
    
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);

    if (!wallets || wallets.length === 0) {
      return {
        text: "You don't have any wallets yet. Type 'create wallet' to get started!"
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
        return { text: "❌ No Solana wallet found. Type 'create wallet' to create one." };
      }
      return { 
        text: `🌸 **Solana Address**\n\`${solanaAddress}\`\n\n💡 Use this address to receive SOL and SPL tokens on Solana network.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Copy Solana Address", copy_text: { text: solanaAddress } }]
          ]
        }
      };
    } else if (requestedNetwork === 'evm' || requestedNetwork === 'base') {
      if (!evmAddress) {
        return { text: "❌ No EVM wallet found. Type 'create wallet' to create one." };
      }
      return { 
        text: `🟦 **Base Address**\n\`${evmAddress}\`\n\n💡 Use this address to receive ETH, USDC and other tokens on Base network.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Copy Base Address", copy_text: { text: evmAddress } }]
          ]
        }
      };
    } else {
      // Show both addresses
      const response = `🟦 **Base Address**\n\`${evmAddress}\`\n\n🌸 **Solana Address**\n\`${solanaAddress}\`\n\n💡 Use these addresses to receive deposits on their respective networks.`;
      
      return { 
        text: response,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📋 Copy Base", copy_text: { text: evmAddress } },
              { text: "📋 Copy Solana", copy_text: { text: solanaAddress } }
            ]
          ]
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

  // Special handling for create_wallets intent
  if (intent === "create_wallets" || intent === "CREATE_WALLET" || 
      params.payload === "create_wallets" || params.payload === "CREATE_WALLET") {
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
    return {
      text: "I didn't understand your request. You can ask about creating a wallet, checking balance, sending crypto, or getting crypto prices.",
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
          .eq('telegram_username', userId)
          .single();
        
        if (userError || !user) {
          console.error(`[handleAction] Failed to find user with username ${userId}:`, userError);
          return {
            text: "❌ User not found. Please make sure you're registered with the bot.",
          };
        }
        
        actualUserId = user.id;
      }
      
      const { data: wallets } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", actualUserId);
      
      const hasEvm = wallets?.some((w) => w.chain === "evm");
      const hasSolana = wallets?.some((w) => w.chain === "solana");
      
      if (!hasEvm && !hasSolana) {
        return {
          text: "You need a wallet before you can continue. Please type 'create wallet' to create your wallet now.",
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

  // Handle core intents
  switch (intent) {
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
    
    case "earnings":
      try {
        const summary = await getEarningsSummary({ walletAddress: userId });
        if (summary) {
          const formatted = formatEarningsForAgent(summary);
          return { text: formatted };
        } else {
          return { text: "No earnings data found. Start using your wallet to track earnings!" };
        }
      } catch (error) {
        console.error('[handleAction] Earnings error:', error);
        return { text: "❌ Failed to fetch earnings data. Please try again later." };
      }
    
    case "help":
      return {
        text: "🦉 **Hedwig Help**\n\n" +
              "Available commands:\n" +
              "• `create wallet` - Create new wallets\n" +
              "• `balance` - Check wallet balances\n" +
              "• `address` - Get wallet addresses\n" +
              "• `earnings` - View earnings summary\n" +
              "• `create payment link` - Create payment links\n" +
              "• `help` - Show this help message\n\n" +
              "More features coming soon for Telegram!"
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
        .eq('telegram_username', userId)
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
        text: "You don't have any wallets yet. Type 'create wallet' to get started!"
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

      // Determine which wallet to use based on token/network
      let selectedWallet;
      let selectedNetwork;
      
      if (token?.toLowerCase() === 'sol' || network?.toLowerCase() === 'solana') {
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
            selectedNetwork === 'evm' ? 'base-sepolia' : 'solana-devnet'
          );
        } else {
          // Token transfer using CDP API <mcreference link="https://docs.cdp.coinbase.com/wallet-api/v2/evm-features/sending-transactions" index="2">2</mcreference>
          let tokenAddress;
          if (token?.toLowerCase() === 'usdc') {
            // Use appropriate USDC contract address based on network
            if (selectedNetwork === 'evm') {
              tokenAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
            } else {
              tokenAddress = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Solana Devnet USDC
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
            selectedNetwork === 'evm' ? 'base-sepolia' : 'solana-devnet'
          );
        }

        // Generate block explorer link
        const explorerUrl = getBlockExplorerUrl(result.hash, selectedNetwork === 'evm' ? 'base-sepolia' : 'solana-devnet');
        
        // Format success message
        const networkName = selectedNetwork === 'evm' ? 'Base' : 'Solana';
        const tokenSymbol = isNativeToken ? 
          (selectedNetwork === 'evm' ? 'ETH' : 'SOL') : 
          (token?.toUpperCase() || 'TOKEN');

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
      
      // Determine which wallet to use based on token/network
      let selectedWallet;
      let selectedNetwork;
      let networkName;
      
      if (token?.toLowerCase() === 'sol' || network?.toLowerCase() === 'solana') {
        selectedWallet = wallets.find(w => w.chain === 'solana');
        selectedNetwork = 'solana-devnet';
        networkName = 'Solana';
      } else {
        // Default to EVM for ETH, USDC, etc.
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'base-sepolia';
        networkName = 'Base';
      }

      if (!selectedWallet) {
        return {
          text: `❌ You don't have a ${networkName} wallet. Please create one first.`
        };
      }

      // Determine transaction type for gas estimation
      const isNativeToken = (
        (selectedNetwork === 'base-sepolia' && (!token || token.toLowerCase() === 'eth')) ||
        (selectedNetwork === 'solana-devnet' && (!token || token.toLowerCase() === 'sol'))
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

      // Create a short transaction ID for callback data (Telegram has 64 byte limit)
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
        .eq('telegram_username', userId)
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
    const { amount, token, network, recipient_email, for: paymentReason } = params;

    // Check if we have all required information
    if (!amount || !token || !paymentReason) {
      return {
        text: "💳 **Create Payment Link**\n\n" +
              "Please provide the following information:\n\n" +
              "**Required Details:**\n" +
              "• **Amount & Token**: e.g., `100 USDC`, `0.5 ETH`\n" +
              "• **Purpose**: What the payment is for\n" +
              "• **Network** (optional): `base`, `ethereum`, `polygon`\n" +
              "• **Recipient Email** (optional): To send the link via email\n\n" +
              "**Example Messages:**\n" +
              "• `Create payment link for 100 USDC for web development`\n" +
              "• `Payment link 0.5 ETH for consulting services`\n" +
              "• `Link for 50 USDT for design work, send to client@example.com`\n\n" +
              "**Supported Tokens:**\n" +
              "• ETH, USDC, USDT, DAI, WETH\n" +
              "• MATIC, ARB, OP\n\n" +
              "💡 **Tip**: Include all details in one message for faster processing!"
      };
    }

    // Set default values
    const selectedNetwork = network?.toLowerCase() || 'base';
    const selectedToken = token?.toUpperCase() || 'USDC';
    const userName = user?.name || 'Hedwig User';

    // Validate network and token
    const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism-sepolia', 'celo-alfajores'];
    const supportedTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'MATIC', 'ARB', 'OP'];

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
      // Call the existing payment link API
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz'}/api/create-payment-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          token: selectedToken,
          network: selectedNetwork,
          walletAddress: evmWallet.address,
          userName: userName,
          for: paymentReason,
          recipientEmail: recipient_email
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create payment link');
      }

      // Format success message
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
      const paymentUrl = `${baseUrl}/pay/${result.id}`;
      
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
        .eq('telegram_username', userId)
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
    const networkName = network === 'solana-devnet' ? 'Solana' : 
                       network === 'base-sepolia' ? 'Base' : 
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

// Export for external use
export { handleCreateWallets, handleGetWalletBalance, handleGetWalletAddress, handleDepositNotification };
