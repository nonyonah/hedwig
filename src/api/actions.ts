import { getOrCreateCdpWallet, createWallet, getTransaction, getBalances, transferNativeToken, transferToken, estimateTransactionFee } from "@/lib/cdp";
import { createClient } from "@supabase/supabase-js";
import { getEarningsSummary, getSpendingSummary, formatEarningsForAgent } from '../lib/earningsService';
import { getTokenPricesBySymbol, TokenPrice } from '../lib/tokenPriceService';
import { 
  processProposalInput, 
  getProposal, 
  getUserProposals, 
  saveProposal,
  type ProposalData 
} from '../lib/proposalservice';
import { sendProposalEmail, generatePDF } from '../lib/proposalPDFService';

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
    const evmWallet = await createWallet(userId, 'base-sepolia');
    console.log(`[handleCreateWallets] EVM wallet created:`, evmWallet);
    
    // Create Solana wallet
    const solanaWallet = await createWallet(userId, 'solana-devnet');
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

async function handleGetWalletBalance(params: ActionParams, userId: string) {
  try {
    // Get all user wallets
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId);
    
    if (!wallets || wallets.length === 0) {
      return {
        text: "You don't have any wallets yet. Type 'create wallet' to get started!"
      };
    }
    
    let response = "💰 **Your Wallet Balances**\n\n";
    
    // Process each wallet
    for (const wallet of wallets) {
      try {
        const networkName = wallet.chain === 'base-sepolia' ? 'Base Sepolia' : 
                           wallet.chain === 'solana-devnet' ? 'Solana Devnet' : 
                           wallet.chain;
        
        response += `🔹 **${networkName}**\n`;
        
        if (wallet.chain === 'base-sepolia') {
          // Get EVM balances (ETH and USDC)
          try {
            const balances = await getBalances(wallet.address, wallet.chain);
            
            // Handle EVM balances - convert to array if needed
            const balanceArray = Array.isArray(balances) ? balances : (balances as any)?.data || [];
            
            // Find ETH balance
            const ethBalance = balanceArray.find((b: any) => b.asset?.symbol === 'ETH');
            if (ethBalance) {
              const formattedEth = formatBalance(ethBalance.amount, ethBalance.asset.decimals);
              response += `   • ETH: ${formattedEth}\n`;
            } else {
              response += `   • ETH: 0.0\n`;
            }
            
            // Find USDC balance
            const usdcBalance = balanceArray.find((b: any) => b.asset?.symbol === 'USDC');
            if (usdcBalance) {
              const formattedUsdc = formatBalance(usdcBalance.amount, usdcBalance.asset.decimals);
              response += `   • USDC: ${formattedUsdc}\n`;
            } else {
              response += `   • USDC: 0.0\n`;
            }
          } catch (balanceError) {
            console.error(`[handleGetWalletBalance] Error fetching ${networkName} balances:`, balanceError);
            response += `   • ETH: Error fetching\n`;
            response += `   • USDC: Error fetching\n`;
          }
        } else if (wallet.chain === 'solana-devnet') {
          // Get Solana balances (SOL and USDC)
          try {
            const balances = await getBalances(wallet.address, wallet.chain);
            
            // Handle Solana balances - should be an array
            const balanceArray = Array.isArray(balances) ? balances : [];
            
            // SOL balance
            const solBalance = balanceArray[0];
            if (solBalance) {
              const formattedSol = formatBalance(solBalance.amount, solBalance.asset.decimals);
              response += `   • SOL: ${formattedSol}\n`;
            } else {
              response += `   • SOL: 0.0\n`;
            }
            
            // TODO: Add USDC SPL token balance check for Solana
            response += `   • USDC: Coming soon\n`;
          } catch (balanceError) {
            console.error(`[handleGetWalletBalance] Error fetching ${networkName} balances:`, balanceError);
            response += `   • SOL: Error fetching\n`;
            response += `   • USDC: Error fetching\n`;
          }
        }
        
        response += `   📍 Address: ${formatAddress(wallet.address)}\n\n`;
      } catch (walletError) {
        console.error(`[handleGetWalletBalance] Error processing wallet:`, walletError);
        response += `   ❌ Error fetching balances\n\n`;
      }
    }
    
    response += "💡 **Available Actions:**\n";
    response += "• Type 'send' to transfer tokens\n";
    response += "• Type 'swap' to exchange tokens\n";
    response += "• Type 'wallet' to see addresses";
    
    return { text: response };
  } catch (error) {
    console.error('[handleGetWalletBalance] Error:', error);
    return {
      text: "❌ Failed to fetch wallet balance. Please try again later."
    };
  }
}

async function handleGetWalletAddress(userId: string) {
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
    
    let response = "📍 **Your Wallet Addresses**\n\n";
    
    wallets.forEach(wallet => {
      const networkName = wallet.chain === 'base-sepolia' ? 'Base' : 
                         wallet.chain === 'solana-devnet' ? 'Solana' : wallet.chain;
      response += `🔹 **${networkName}**: ${formatAddress(wallet.address)}\n`;
    });
    
    response += "\nYou can share these addresses to receive crypto payments.";
    
    return { text: response };
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
) {
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
      
      const hasEvm = wallets?.some((w) => w.chain === "base-sepolia");
      const hasSolana = wallets?.some((w) => w.chain === "solana-devnet");
      
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
      return await handleGetWalletAddress(userId);
    
    case "send":
      return {
        text: "💸 **Send Feature**\n\nSending crypto is currently being updated for Telegram. This feature will be available soon!"
      };
    
    case "swap":
      return {
        text: "🔄 **Swap Feature**\n\nToken swapping is currently being updated for Telegram. This feature will be available soon!"
      };
    
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

// Export for external use
export { handleCreateWallets, handleGetWalletBalance, handleGetWalletAddress };
