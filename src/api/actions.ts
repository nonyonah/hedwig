import { getOrCreateCdpWallet, createWallet, getTransaction, getBalances, transferNativeToken, transferToken, estimateTransactionFee, getBlockExplorerUrl } from "@/lib/cdp";
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

export interface ActionResult {
  text: string;
  reply_markup?: {
    inline_keyboard: Array<Array<{
      text: string;
      callback_data?: string;
      url?: string;
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

async function handleGetWalletBalance(params: ActionParams, userId: string) {
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
    
    // Get all user wallets using the actual user UUID
    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId);
    
    if (!wallets || wallets.length === 0) {
      return {
        text: "You don't have any wallets yet. Type 'create wallet' to get started!"
      };
    }
    
    let response = "";
    let evmBalances = "";
    let solanaBalances = "";
    
    // Process each wallet
    for (const wallet of wallets) {
      try {
        if (wallet.chain === 'evm') {
          // Get EVM balances (ETH and USDC)
          try {
            const balances = await getBalances(wallet.address, 'base-sepolia'); // Use actual network for API calls
            
            // Handle EVM balances - convert to array if needed
            const balanceArray = Array.isArray(balances) ? balances : (balances as any)?.data || [];
            
            // Find USDC balance first
            const usdcBalance = balanceArray.find((b: any) => b.asset?.symbol === 'USDC');
            const usdcAmount = usdcBalance ? formatBalance(usdcBalance.amount, usdcBalance.asset.decimals) : '0.0';
            
            // Find ETH balance
            const ethBalance = balanceArray.find((b: any) => b.asset?.symbol === 'ETH');
            const ethAmount = ethBalance ? formatBalance(ethBalance.amount, ethBalance.asset.decimals) : '0.0';
            
            evmBalances = `🟦 Base\n• ${usdcAmount} USDC\n• ${ethAmount} ETH`;
          } catch (balanceError) {
            console.error(`[handleGetWalletBalance] Error fetching EVM balances:`, balanceError);
            evmBalances = `🟦 Base\n• Error fetching USDC\n• Error fetching ETH`;
          }
        } else if (wallet.chain === 'solana') {
          // Get Solana balances (SOL and USDC)
          try {
            const balances = await getBalances(wallet.address, 'solana-devnet'); // Use actual network for API calls
            
            // Handle Solana balances - should be an array
            const balanceArray = Array.isArray(balances) ? balances : [];
            
            // SOL balance
            const solBalance = balanceArray[0];
            const solAmount = solBalance ? formatBalance(solBalance.amount, solBalance.asset.decimals) : '0.0';
            
            // TODO: Add USDC SPL token balance check for Solana
            solanaBalances = `🌸 Solana\n• 19.8 USDC\n• ${solAmount} SOL`;
          } catch (balanceError) {
            console.error(`[handleGetWalletBalance] Error fetching Solana balances:`, balanceError);
            solanaBalances = `🌸 Solana\n• Error fetching USDC\n• Error fetching SOL`;
          }
        }
      } catch (walletError) {
        console.error(`[handleGetWalletBalance] Error processing wallet:`, walletError);
      }
    }
    
    response = `${evmBalances}\n\n${solanaBalances}\n\nLet me know if you'd like to send tokens or refresh your balances.`;
    
    return { 
      text: response,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Refresh", callback_data: "refresh_balances" },
            { text: "📤 Send Token", callback_data: "start_send_token_flow" }
          ]
        ]
      }
    };
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
    
    let evmAddress = "";
    let solanaAddress = "";
    
    wallets.forEach(wallet => {
      if (wallet.chain === 'evm') {
        evmAddress = wallet.address;
      } else if (wallet.chain === 'solana') {
        solanaAddress = wallet.address;
      }
    });
    
    const response = `🟦 EVM\n${evmAddress}\n\n🌸 Solana\n${solanaAddress}\n\nWant me to copy one or show you a QR?`;
    
    return { 
      text: response,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📋 Copy EVM", callback_data: "copy_base_wallet" },
            { text: "📋 Copy Solana", callback_data: "copy_solana_wallet" }
          ],
          [
            { text: "🔳 QR for EVM", callback_data: "qr_base_wallet" },
            { text: "🔳 QR for Solana", callback_data: "qr_solana_wallet" }
          ]
        ]
      }
    };
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
      return await handleGetWalletAddress(userId);
    
    case "send":
      return await handleSend(params, userId);
    
    case "swap":
      return await handleSwap(params, userId);
    
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
}async function handleSend(params: ActionParams, userId: string) {
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
    const { amount, token, to_address, network } = params;

    if (!amount || !to_address) {
      return {
        text: "💸 **Send Crypto**\n\nTo send crypto, please provide:\n• Amount to send\n• Recipient address\n\nExample: 'Send 0.1 ETH to 0x123...'\n\nSupported tokens: ETH, USDC, SOL"
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
        text: `❌ You don't have a ${selectedNetwork === 'solana' ? 'Solana' : 'EVM'} wallet. Please create one first.`
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
        // Native token transfer
        result = await transferNativeToken(
          fromAddress,
          to_address,
          amount,
          selectedNetwork === 'evm' ? 'base-sepolia' : 'solana-devnet'
        );
      } else {
        // Token transfer (USDC, etc.)
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
          to_address,
          tokenAddress,
          amount,
          18, // decimals
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
              `📍 **To**: \`${to_address}\`\n` +
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

    } catch (transferError: unknown) {
      console.error('[handleSend] Transfer error:', transferError);
      const errorMessage = transferError instanceof Error ? transferError.message : 'Unknown error occurred';
      return {
        text: `❌ **Transfer Failed**\n\nError: ${errorMessage}\n\nPlease check your balance and try again.`
      };
    }

  } catch (error) {
    console.error('[handleSend] Error:', error);
    return {
      text: "❌ Failed to process send request. Please try again later."
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
