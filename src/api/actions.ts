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
import { PaymentLinkReminderService } from '../lib/paymentLinkReminderService';
import { offrampService } from '../services/offrampService';
import { offrampSessionService } from '../services/offrampSessionService';
import { ServerPaycrestService } from '../services/serverPaycrestService';
import { multiNetworkPaymentService } from '../services/MultiNetworkPaymentService';

// Initialize the service
const serverPaycrestService = new ServerPaycrestService();

import fetch from "node-fetch";
import { formatUnits } from "viem";
import { formatAddress, formatBalance } from "../lib/utils";
import { handleCurrencyConversion } from "../lib/currencyConversionService";
import * as crypto from "crypto";

import type { NextApiRequest, NextApiResponse } from "next";
import { formatEther, parseUnits, encodeFunctionData, toHex } from 'viem';
import { sessionManager } from '../lib/sessionManager';
import { sendNativeTokenViem, sendTokenViem } from '../lib/viemClient';
import { sendSolanaToken } from '../lib/solanaClient';
import { transactionStorage } from '../lib/transactionStorage';

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
        text: "I couldn't find your account. Please make sure you're registered with the bot.",
      };
    }

    // Create EVM wallet
    const evmWallet = await createWallet(actualUserId, 'evm');
    console.log(`[handleCreateWallets] EVM wallet created:`, evmWallet);

    // Create Solana wallet
    const solanaWallet = await createWallet(actualUserId, 'solana');
    console.log(`[handleCreateWallets] Solana wallet created:`, solanaWallet);

    return {
      text: `Great news! I've successfully created your wallets for you.

Your EVM wallet address is ${evmWallet.address}
Your Solana wallet address is ${solanaWallet.address}

Both wallets are now ready to use! You can start sending crypto or creating payment links right away. Your wallets are secured by Coinbase's infrastructure for maximum safety.`
    };
  } catch (error) {
    console.error('[handleCreateWallets] Error:', error);
    return {
      text: "I encountered an issue while creating your wallets. Please try again in a moment, or reach out to support if the problem continues."
    };
  }
}

async function handleGetWalletBalance(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "I couldn't find your account. Please make sure you're registered with the bot.",
      };
    }

    const { data: wallets } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", actualUserId)
      .order("created_at", { ascending: true });

    if (!wallets || wallets.length === 0) {
      return {
        text: "Your wallet is being set up automatically. Please try again in a moment."
      };
    }

    // Check if user requested specific network or token
    const requestedNetwork = params?.parameters?.network?.toLowerCase();
    const requestedToken = params?.parameters?.token?.toUpperCase();

    // Map specific chains to their categories
    const evmChains = ['evm', 'base', 'ethereum', 'optimism', 'celo', 'lisk'];
    const isEvmRequest = requestedNetwork && evmChains.includes(requestedNetwork);
    const isSolanaRequest = requestedNetwork === 'solana';
    const isSpecificChainRequest = requestedNetwork && (evmChains.includes(requestedNetwork) || requestedNetwork === 'solana');
    const isTokenSpecificRequest = requestedToken && ['USDC', 'USDT', 'CNGN', 'CUSD', 'ETH', 'CELO', 'SOL'].includes(requestedToken);

    let evmBalances = "";
    let solanaBalances = "";
    let response = "";

    // Get EVM wallet
    const evmWallet = wallets.find(w => w.chain === 'evm');
    if (evmWallet) {
      try {
        // Get balances for supported networks - disabled Arbitrum and BSC networks
        const supportedEvmNetworks = ['base', 'celo', 'lisk'];
        let allEvmBalances = "";

        // Get token prices for USD conversion
        let tokenPrices: any = {};
        try {
          const prices = await getTokenPricesBySymbol(['ETH', 'USDC', 'cUSD', 'LISK', 'CELO']);
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
            'base': 'base',
            'lisk': 'lisk',
            'lisk-sepolia': 'lisk',
            'celo': 'celo',
            'celo-sepolia': 'celo'
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
            let nativeBalance = '0';
            let usdcBalance = '0';
            let cusdBalance = '0';
            let usdtBalance = '0';
            let cngnBalance = '0';
            let additionalTokens: any[] = [];

            if (Array.isArray(balances)) {
              // Solana format or processed EVM format
              const nativeToken = balances.find((b: any) =>
                b.asset?.symbol === 'ETH' || b.symbol === 'ETH' ||
                b.asset?.symbol === 'CELO' || b.symbol === 'CELO'
              );

              // Network-specific token handling
              let usdcToken, cusdToken, usdtToken, cngnToken;

              if (network === 'celo') {
                // For Celo: USDC, cUSD, and cNGN (no USDT)
                usdcToken = balances.find((b: any) => b.asset?.symbol === 'USDC' || b.symbol === 'USDC');
                cusdToken = balances.find((b: any) => b.asset?.symbol === 'cUSD' || b.symbol === 'cUSD');
                cngnToken = balances.find((b: any) => b.asset?.symbol === 'cNGN' || b.symbol === 'cNGN');
                const celoTokenToken = balances.find((b: any) => b.asset?.symbol === 'CELO_TOKEN' || b.symbol === 'CELO_TOKEN');
                // Don't add cUSD to additionalTokens as it's already displayed in the main section
                if (celoTokenToken) additionalTokens.push({ symbol: 'CELO Token', balance: (celoTokenToken as any)?.balance || (celoTokenToken as any)?.amount || '0' });
              } else if (network === 'lisk') {
                // For Lisk: LSK token
                const liskToken = balances.find((b: any) => b.asset?.symbol === 'LSK' || b.symbol === 'LSK');
                if (liskToken) additionalTokens.push({ symbol: 'LSK', balance: (liskToken as any)?.balance || (liskToken as any)?.amount || '0' });
              } else {
                // For other networks: USDC, USDT, and cNGN
                usdcToken = balances.find((b: any) => b.asset?.symbol === 'USDC' || b.symbol === 'USDC');
                usdtToken = balances.find((b: any) => b.asset?.symbol === 'USDT' || b.symbol === 'USDT');
                cngnToken = balances.find((b: any) => b.asset?.symbol === 'cNGN' || b.symbol === 'cNGN');
              }

              nativeBalance = (nativeToken as any)?.balance || (nativeToken as any)?.amount || '0';
              usdcBalance = (usdcToken as any)?.balance || (usdcToken as any)?.amount || '0';
              cusdBalance = (cusdToken as any)?.balance || (cusdToken as any)?.amount || '0';
              usdtBalance = (usdtToken as any)?.balance || (usdtToken as any)?.amount || '0';
              cngnBalance = (cngnToken as any)?.balance || (cngnToken as any)?.amount || '0';
            } else if (balances && typeof balances === 'object' && 'data' in balances) {
              // EVM ListTokenBalancesResult format (from CDP or Alchemy)
              const balanceArray = (balances as any).data || [];
              const nativeToken = balanceArray.find((b: any) =>
                b.asset?.symbol === 'ETH' || b.asset?.symbol === 'CELO'
              );

              // Network-specific token handling
              let usdcToken, cusdToken, usdtToken, cngnToken;

              if (network === 'celo') {
                // For Celo: USDC, cUSD, and cNGN (no USDT)
                usdcToken = balanceArray.find((b: any) => b.asset?.symbol === 'USDC');
                cusdToken = balanceArray.find((b: any) => b.asset?.symbol === 'cUSD');
                cngnToken = balanceArray.find((b: any) => b.asset?.symbol === 'cNGN');
                const celoTokenToken = balanceArray.find((b: any) => b.asset?.symbol === 'CELO_TOKEN');
                // Don't add cUSD to additionalTokens as it's already displayed in the main section
                if (celoTokenToken) additionalTokens.push({ symbol: 'CELO Token', balance: formatBalance(celoTokenToken.amount, celoTokenToken.asset.decimals) });
              } else if (network === 'lisk') {
                // For Lisk: USDT and LSK token
                usdtToken = balanceArray.find((b: any) => b.asset?.symbol === 'USDT');
                const liskToken = balanceArray.find((b: any) => b.asset?.symbol === 'LSK');
                if (liskToken) additionalTokens.push({ symbol: 'LSK', balance: formatBalance(liskToken.amount, liskToken.asset.decimals) });
              } else {
                // For other networks: USDC, USDT, and cNGN
                usdcToken = balanceArray.find((b: any) => b.asset?.symbol === 'USDC');
                usdtToken = balanceArray.find((b: any) => b.asset?.symbol === 'USDT');
                cngnToken = balanceArray.find((b: any) => b.asset?.symbol === 'cNGN');
              }

              nativeBalance = nativeToken ? formatBalance(nativeToken.amount, nativeToken.asset.decimals) : '0';
              usdcBalance = usdcToken ? formatBalance(usdcToken.amount, usdcToken.asset.decimals) : '0';
              cusdBalance = cusdToken ? formatBalance(cusdToken.amount, cusdToken.asset.decimals) : '0';
              usdtBalance = usdtToken ? formatBalance(usdtToken.amount, usdtToken.asset.decimals) : '0';
              cngnBalance = cngnToken ? formatBalance(cngnToken.amount, cngnToken.asset.decimals) : '0';
            }

            const networkName = network.replace('-sepolia', '').replace('-alfajores', '').replace('-testnet', '');
            const displayName = networkName === 'lisk' ? 'Lisk' :
              networkName === 'celo' ? 'Celo' :
                networkName.charAt(0).toUpperCase() + networkName.slice(1);

            // Get chain-specific icon
            const chainIcon = network === 'base' ? '🔵' :
              network === 'ethereum' ? '💎' :
                network === 'celo' ? '🟡' :
                  network === 'lisk' ? '🟢' :
                    network === 'optimism' ? '🔴' :
                      network === 'polygon' ? '🟣' : '🔹';

            // Format balances with USD equivalents
            const nativeBalanceNum = parseFloat(nativeBalance);
            const usdcBalanceNum = parseFloat(usdcBalance);
            const cusdBalanceNum = parseFloat(cusdBalance || '0');
            const usdtBalanceNum = parseFloat(usdtBalance);
            const cngnBalanceNum = parseFloat(cngnBalance);

            // Determine native token symbol
            const nativeSymbol = network === 'lisk' ? 'ETH' :
              network === 'celo' ? 'CELO' : 'ETH';

            let nativeDisplay = `${nativeBalanceNum.toFixed(4)} ${nativeSymbol}`;
            let usdcDisplay = `${usdcBalanceNum.toFixed(2)} USDC`;
            let cusdDisplay = `${cusdBalanceNum.toFixed(2)} cUSD`;
            let usdtDisplay = `${usdtBalanceNum.toFixed(2)} USDT`;
            let cngnDisplay = `${cngnBalanceNum.toFixed(2)} cNGN`;

            // Add USD equivalents if prices available
            const nativePriceKey = nativeSymbol === 'CELO' ? 'CELO' : 'ETH';
            if (tokenPrices[nativePriceKey] && nativeBalanceNum > 0) {
              const nativeUsd = (nativeBalanceNum * tokenPrices[nativePriceKey]).toFixed(2);
              nativeDisplay += ` ($${nativeUsd})`;
            }

            if (tokenPrices.USDC && usdcBalanceNum > 0) {
              const usdcUsd = (usdcBalanceNum * tokenPrices.USDC).toFixed(2);
              usdcDisplay += ` ($${usdcUsd})`;
            }

            if (tokenPrices.cUSD && cusdBalanceNum > 0) {
              const cusdUsd = (cusdBalanceNum * tokenPrices.cUSD).toFixed(2);
              cusdDisplay += ` ($${cusdUsd})`;
            }

            if (tokenPrices.USDT && usdtBalanceNum > 0) {
              const usdtUsd = (usdtBalanceNum * tokenPrices.USDT).toFixed(2);
              usdtDisplay += ` ($${usdtUsd})`;
            }

            if (tokenPrices.cNGN && cngnBalanceNum > 0) {
              const cngnUsd = (cngnBalanceNum * tokenPrices.cNGN).toFixed(2);
              cngnDisplay += ` ($${cngnUsd})`;
            }

            allEvmBalances += `${chainIcon} **${displayName}**\n`;
            allEvmBalances += `• ${nativeDisplay}\n`;

            // Network-specific token display
            if (network === 'celo') {
              // For Celo: show USDC, cUSD, and cNGN
              allEvmBalances += `• ${usdcDisplay}\n`;
              allEvmBalances += `• ${cusdDisplay}\n`;
              if (cngnBalanceNum > 0) {
                allEvmBalances += `• ${cngnDisplay}\n`;
              }
            } else if (network === 'lisk') {
              // For Lisk: show USDT
              allEvmBalances += `• ${usdtDisplay}\n`;
            } else {
              // For other networks: show USDC, USDT, and cNGN
              allEvmBalances += `• ${usdcDisplay}\n`;
              allEvmBalances += `• ${usdtDisplay}\n`;
              allEvmBalances += `• ${cngnDisplay}\n`;
            }

            // Add additional tokens for Celo and Lisk
            for (const token of additionalTokens) {
              const tokenBalanceNum = parseFloat(token.balance);
              allEvmBalances += `• ${tokenBalanceNum.toFixed(4)} ${token.symbol}\n`;
            }

            allEvmBalances += '\n';
          } catch (networkError) {
            console.error(`[handleGetWalletBalance] Error fetching ${network} balances:`, networkError);
            const networkName = network.replace('-sepolia', '').replace('-alfajores', '');
            const displayName = networkName.charAt(0).toUpperCase() + networkName.slice(1);

            // Get chain-specific icon for error case
            const chainIcon = network === 'base' ? '🔵' :
              network === 'ethereum' ? '💎' :
                network === 'celo' ? '🟡' :
                  network === 'lisk' ? '🟢' :
                    network === 'optimism' ? '🔴' :
                      network === 'polygon' ? '🟣' : '🔹';

            allEvmBalances += `${chainIcon} **${displayName}**\n• Error fetching balances\n\n`;
          }
        }

        evmBalances = `Here are your balances\n${allEvmBalances}`;
      } catch (balanceError) {
        console.error(`[handleGetWalletBalance] Error fetching EVM balances:`, balanceError);
        evmBalances = `Here are your balances\n• Error fetching balances\n\n`;
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
    if (isTokenSpecificRequest && requestedNetwork) {
      // Handle token-specific requests on specific networks
      const networkName = requestedNetwork.charAt(0).toUpperCase() + requestedNetwork.slice(1);

      if (isSolanaRequest) {
        // Extract specific token from Solana balances
        if (requestedToken === 'SOL' || requestedToken === 'USDC' || requestedToken === 'USDT') {
          const tokenMatch = solanaBalances.match(new RegExp(`• ([^\\n]*${requestedToken}[^\\n]*)`, 'i'));
          if (tokenMatch) {
            const tokenBalance = tokenMatch[1];
            // Extract balance amount and USD value for natural language response
            const balanceMatch = tokenBalance.match(/(\d+\.?\d*)\s+(\w+)(?:\s+\(~\$(\d+\.?\d*)\))?/);
            if (balanceMatch) {
              const amount = balanceMatch[1];
              const symbol = balanceMatch[2];
              const usdValue = balanceMatch[3];

              if (usdValue) {
                response = `Your ${symbol} balance on Solana is ${amount} ${symbol} (approximately $${usdValue}).`;
              } else {
                response = `Your ${symbol} balance on Solana is ${amount} ${symbol}.`;
              }
            } else {
              response = `Your ${requestedToken} balance on Solana is ${tokenBalance}.`;
            }
          } else {
            response = `You don't have any ${requestedToken} on Solana.`;
          }
        } else {
          response = `${requestedToken} is not supported on Solana. Available tokens: SOL, USDC, USDT.`;
        }
      } else if (isEvmRequest) {
        // Extract specific token from EVM balances for the requested network
        const networkSection = evmBalances.match(new RegExp(`([🔵🟡🟢💎🔴🟣🔹] \\*\\*${networkName}\\*\\*[\\s\\S]*?)(?=\\n[🔵🟡🟢💎🔴🟣🔹]|$)`, 'i'));

        if (networkSection) {
          let tokenLine = '';

          // Map token names to their display patterns
          const tokenPatterns: { [key: string]: string } = {
            'USDC': 'USDC',
            'USDT': 'USDT',
            'CNGN': 'cNGN',
            'CUSD': 'cUSD',
            'ETH': 'ETH',
            'CELO': 'CELO'
          };

          const pattern = tokenPatterns[requestedToken];
          if (pattern) {
            const tokenMatch = networkSection[1].match(new RegExp(`• ([^\\n]*${pattern}[^\\n]*)`, 'i'));
            if (tokenMatch) {
              tokenLine = tokenMatch[1];
            }
          }

          if (tokenLine) {
            // Extract balance amount and USD value for natural language response
            const balanceMatch = tokenLine.match(/(\d+\.?\d*)\s+(\w+)(?:\s+\(~\$(\d+\.?\d*)\))?/);
            if (balanceMatch) {
              const amount = balanceMatch[1];
              const symbol = balanceMatch[2];
              const usdValue = balanceMatch[3];

              if (usdValue) {
                response = `Your ${symbol} balance on ${networkName} is ${amount} ${symbol} (approximately $${usdValue}).`;
              } else {
                response = `Your ${symbol} balance on ${networkName} is ${amount} ${symbol}.`;
              }
            } else {
              response = `Your ${requestedToken} balance on ${networkName} is ${tokenLine}.`;
            }
          } else {
            response = `You don't have any ${requestedToken} on ${networkName}.`;
          }
        } else {
          response = `${networkName} network is not supported or not found.`;
        }
      } else {
        response = `Please specify a valid network (Base, Celo, Lisk, Ethereum, or Solana) for ${requestedToken} balance.`;
      }
    } else if (isTokenSpecificRequest && !requestedNetwork) {
      // Handle token-specific requests without network specification
      let tokenFound = false;
      let tokenBalances: string[] = [];

      // Search for token across all networks
      if (requestedToken === 'SOL' || requestedToken === 'USDC' || requestedToken === 'USDT') {
        // Check Solana first
        const tokenMatch = solanaBalances.match(new RegExp(`• ([^\\n]*${requestedToken}[^\\n]*)`, 'i'));
        if (tokenMatch) {
          const tokenBalance = tokenMatch[1];
          const balanceMatch = tokenBalance.match(/(\d+\.?\d*)\s+(\w+)(?:\s+\(~\$(\d+\.?\d*)\))?/);
          if (balanceMatch) {
            const amount = balanceMatch[1];
            const symbol = balanceMatch[2];
            const usdValue = balanceMatch[3];

            if (parseFloat(amount) > 0) {
              tokenFound = true;
              if (usdValue) {
                tokenBalances.push(`${amount} ${symbol} on Solana (~$${usdValue})`);
              } else {
                tokenBalances.push(`${amount} ${symbol} on Solana`);
              }
            }
          }
        }
      }

      // Check EVM networks for the token
      const tokenPatterns: { [key: string]: string } = {
        'USDC': 'USDC',
        'USDT': 'USDT',
        'CNGN': 'cNGN',
        'CUSD': 'cUSD',
        'ETH': 'ETH',
        'CELO': 'CELO'
      };

      const pattern = tokenPatterns[requestedToken];
      if (pattern) {
        // Extract from each network section
        const networkRegex = /([🔵🟡🟢💎🔴🟣🔹] \*\*([^*]+)\*\*[\s\S]*?)(?=\n[🔵🟡🟢💎🔴🟣🔹]|$)/g;
        let networkMatch;

        while ((networkMatch = networkRegex.exec(evmBalances)) !== null) {
          const networkSection = networkMatch[1];
          const networkName = networkMatch[2];

          const tokenMatch = networkSection.match(new RegExp(`• ([^\\n]*${pattern}[^\\n]*)`, 'i'));
          if (tokenMatch) {
            const tokenLine = tokenMatch[1];
            const balanceMatch = tokenLine.match(/(\d+\.?\d*)\s+(\w+)(?:\s+\(~\$(\d+\.?\d*)\))?/);
            if (balanceMatch) {
              const amount = balanceMatch[1];
              const symbol = balanceMatch[2];
              const usdValue = balanceMatch[3];

              if (parseFloat(amount) > 0) {
                tokenFound = true;
                if (usdValue) {
                  tokenBalances.push(`${amount} ${symbol} on ${networkName} (~$${usdValue})`);
                } else {
                  tokenBalances.push(`${amount} ${symbol} on ${networkName}`);
                }
              }
            }
          }
        }
      }

      if (tokenFound) {
        if (tokenBalances.length === 1) {
          response = `Your ${requestedToken} balance is ${tokenBalances[0]}.`;
        } else {
          response = `Your ${requestedToken} balances:\n${tokenBalances.map(b => `• ${b}`).join('\n')}`;
        }
      } else {
        response = `You don't have any ${requestedToken} in your wallets.`;
      }
    } else if (isSolanaRequest) {
      response = solanaBalances || "No Solana wallet found.";
    } else if (isEvmRequest) {
      response = evmBalances || "No EVM wallet found.";
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
      response = "Unable to fetch wallet balances. Please try again later.";
    }

    // Return different response format based on request type
    if (isTokenSpecificRequest || (requestedNetwork && !isTokenSpecificRequest)) {
      // For token-specific requests or network-specific requests, return natural language response without buttons
      return {
        text: response
      };
    } else {
      // For general balance requests, include the refresh and send buttons
      return {
        text: response,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Refresh", callback_data: "refresh_balances" },
              { text: "📤 Send", callback_data: "start_send_token_flow" }
            ]
          ]
        }
      };
    }
  } catch (error) {
    console.error('[handleGetWalletBalance] Error:', error);
    return {
      text: "Failed to fetch wallet balances. Please try again later."
    };
  }
}

async function handleGetWalletAddress(userId: string, params?: ActionParams): Promise<ActionResult> {
  try {
    const actualUserId = await resolveUserId(userId);
    if (!actualUserId) {
      return {
        text: "User not found. Please make sure you're registered with the bot.",
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
          text: "No Solana wallet found.\n\nCreate Solana Wallet:\nType: 'Create Solana wallet'",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🌸 Create Solana Wallet", callback_data: "create_solana_wallet" }]
            ]
          }
        };
      }
      return {
        text: `Your Solana Wallet\n\nAddress:\n\`${solanaAddress}\`\n\nUse this address to receive SOL, USDC, and other SPL tokens on Solana network.\n\nKeep this address safe and share it only when receiving payments.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "Copy Solana Address", copy_text: { text: solanaAddress } }]
          ]
        }
      };
    } else if (requestedNetwork === 'evm' || requestedNetwork === 'base') {
      if (!evmAddress) {
        return {
          text: "No EVM wallet found.\n\nCreate EVM Wallet:\nType: 'Create EVM wallet'",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🟦 Create EVM Wallet", callback_data: "create_evm_wallet" }]
            ]
          }
        };
      }
      return {
        text: `Your EVM Wallet\n\nAddress:\n\`${evmAddress}\`\n\nUse this address to receive ETH, USDC, and other tokens on EVM networks.\n\nKeep this address safe and share it only when receiving payments.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "Copy EVM Address", copy_text: { text: evmAddress } }]
          ]
        }
      };
    } else {
      // Show both addresses if they exist
      let responseText = "Your Wallet Addresses\n\n";
      let buttons: Array<{ text: string; copy_text?: { text: string }; callback_data?: string }> = [];

      if (evmAddress) {
        responseText += `🟦 **EVM Network:**\n\`${evmAddress}\`\n\n`;
        buttons.push({ text: "Copy EVM", copy_text: { text: evmAddress } });
      }

      if (solanaAddress) {
        responseText += `🌸 **Solana Network:**\n\`${solanaAddress}\`\n\n`;
        buttons.push({ text: "Copy Solana", copy_text: { text: solanaAddress } });
      }

      responseText += "Use these addresses to receive deposits on their respective networks.\n\nKeep these addresses safe and share them only when receiving payments.";

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
      text: "Failed to fetch wallet address. Please try again later."
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

  // Text-based intent matching
  if (params.text && typeof params.text === 'string') {
    const text = params.text.toLowerCase();

    // Balance intent matching (but not during active offramp sessions)
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

    // Onramp intent matching - comprehensive natural language recognition
    // But first check if this is a payment link context to avoid false positives
    const isPaymentLinkContext = text.includes('payment link') || 
                                text.includes('create payment') || 
                                text.includes('payment for') ||
                                text.includes('invoice') ||
                                text.includes('bill') ||
                                text.includes('charge') ||
                                text.includes('request payment') ||
                                text.includes('collect payment');

    // Skip onramp detection if this is clearly a payment link request
    if (!isPaymentLinkContext) {
      const onrampKeywords = [
        'buy crypto', 'buy cryptocurrency', 'buy tokens', 'buy token',
        'purchase crypto', 'purchase cryptocurrency', 'purchase tokens', 'purchase token',
        'buy usdc', 'buy usdt', 'buy cusd', 'buy celo dollar',
        'buy with fiat', 'buy with cash', 'buy with money',
        'convert fiat', 'convert cash', 'convert money',
        'fiat to crypto', 'cash to crypto', 'money to crypto',
        'onramp', 'on-ramp', 'on ramp',
        'buy some crypto', 'buy some tokens', 'buy some token',
        'want to buy', 'would like to buy', 'i want to buy', "i'd like to buy",
        'need to buy', 'looking to buy', 'trying to buy',
        'get some crypto', 'get some tokens', 'get crypto', 'get tokens',
        'acquire crypto', 'acquire tokens'
      ];

    // Check for specific token mentions
    const tokenKeywords = [
      'usdc', 'usd coin', 'usdt', 'tether', 'cusd', 'celo dollar'
    ];

    // Check for chain mentions
    const chainKeywords = [
      'solana', 'sol', 'base', 'celo', 'lisk', 'ethereum', 'eth'
    ];

    // Check for currency mentions
    const currencyKeywords = [
      'ngn', 'naira', 'nigerian naira',
      'kes', 'kenyan shilling', 'shilling',
      'ghs', 'ghanaian cedi', 'cedi',
      'ugx', 'ugandan shilling',
      'tzs', 'tanzanian shilling'
    ];

    const hasOnrampKeyword = onrampKeywords.some(keyword => text.includes(keyword));
    const hasTokenKeyword = tokenKeywords.some(keyword => text.includes(keyword));
    const hasChainKeyword = chainKeywords.some(keyword => text.includes(keyword));
    const hasCurrencyKeyword = currencyKeywords.some(keyword => text.includes(keyword));

      // If user mentions onramp keywords OR wants to buy specific tokens/chains
      if (hasOnrampKeyword ||
        (hasTokenKeyword && (text.includes('buy') || text.includes('purchase') || text.includes('get'))) ||
        (hasChainKeyword && hasTokenKeyword) ||
        (text.includes('buy') && (hasTokenKeyword || hasChainKeyword || hasCurrencyKeyword))) {

        console.log('[handleAction] Detected onramp intent from natural language:', text);
        return await handleOnramp(params, userId);
      }
    } // End of payment link context check
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
          text: "User not found. Please make sure you're registered with the bot.",
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
      text: "Currency conversion is currently disabled. This feature has been temporarily removed, so please use external tools for currency conversion needs.",
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
          text: `Welcome! I've automatically created your wallets for you.

Your EVM wallet address is ${evmWallet.address}
Your Solana wallet address is ${solanaWallet.address}

Your wallets are now ready! Please try your command again.`
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
      return await handleSendInstructions(params, userId);

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

    case "onramp":
    case "buy":
    case "purchase":
      return await handleOnramp(params, userId);



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

        // Get user data for enhanced processing
        const { data: userData } = await supabase
          .from('users')
          .select('name, telegram_first_name, telegram_last_name, telegram_username')
          .eq('id', userId)
          .single();

        const userDataFormatted = userData ? {
          name: userData.name,
          telegramFirstName: userData.telegram_first_name,
          telegramLastName: userData.telegram_last_name,
          telegramUsername: userData.telegram_username
        } : undefined;

        // Use enhanced natural language processing if text is provided
        if (params.text && params.text.length > 5) {
          const { getEarningsForNaturalQuery, formatEarningsForNaturalLanguage } = await import('../lib/earningsService');
          
          try {
            const earningsData = await getEarningsForNaturalQuery(params.text, walletAddresses, userDataFormatted);
            const response = formatEarningsForNaturalLanguage(earningsData, params.text, 'telegram');
            
            return {
              text: response,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "📄 Generate PDF Report", callback_data: "generate_earnings_pdf_natural" },
                    { text: "📊 Business Dashboard", callback_data: "business_dashboard" }
                  ]
                ]
              }
            };
          } catch (nlError) {
            console.error('[handleAction] Natural language earnings error:', nlError);
            // Fall back to traditional processing
          }
        }

        // Traditional earnings processing (fallback)
        const { getEarningsSummary, formatEarningsForAgent } = await import('../lib/earningsService');

        const filter = {
          walletAddresses,
          timeframe: params.timeframe || 'allTime',
          token: params.token,
          network: params.network,
          startDate: params.startDate,
          endDate: params.endDate,
          includeInsights: true
        };

        const summary = await getEarningsSummary(filter, true);
        if (summary && summary.totalPayments > 0) {
          const formatted = formatEarningsForAgent(summary, 'earnings');
          return {
            text: formatted,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "📄 Generate PDF Report", callback_data: "generate_earnings_pdf" },
                  { text: "📊 Business Dashboard", callback_data: "business_dashboard" }
                ],
                [
                  { text: '🗓️ This Month', callback_data: 'earnings_shortcut_this_month' },
                  { text: '📅 Last Month', callback_data: 'earnings_shortcut_last_month' }
                ]
              ]
            }
          };
        } else {
          return { 
            text: "💰 **Earnings Summary**\n\nYour earnings tracking is ready! Start receiving payments to see detailed analytics.\n\n💡 **Try these commands:**\n• \"show my earnings this month\"\n• \"how much did I earn last week\"\n• \"generate earnings PDF\"\n• \"USDC earnings on Base\"\n\n📊 **Ways to earn:**\n• Create payment links\n• Generate invoices\n• Receive direct transfers\n\nCreate your first payment method to start tracking!",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "💳 Create Payment Link", callback_data: "create_payment_link" },
                  { text: "📄 Create Invoice", callback_data: "create_invoice" }
                ]
              ]
            }
          };
        }
      } catch (error) {
        console.error('[handleAction] Earnings error:', error);
        
        // Enhanced error handling
        const { EarningsErrorHandler } = await import('../lib/earningsErrorHandler');
        const errorMessage = EarningsErrorHandler.formatErrorForUser(
          error instanceof Error ? error : new Error(String(error)),
          params.text || 'earnings',
          'telegram'
        );
        
        return { text: errorMessage };
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

    case "generate_earnings_pdf_natural":
      try {
        // Get user's wallet addresses
        const walletAddresses = await getUserWalletAddresses(userId);
        if (!walletAddresses || walletAddresses.length === 0) {
          return { text: "Your wallet is being set up automatically. Please try again in a moment." };
        }

        // Get user data for PDF generation
        const { data: userData } = await supabase
          .from('users')
          .select('name, telegram_first_name, telegram_last_name, telegram_username')
          .eq('id', userId)
          .single();

        const userDataFormatted = userData ? {
          name: userData.name,
          telegramFirstName: userData.telegram_first_name,
          telegramLastName: userData.telegram_last_name,
          telegramUsername: userData.telegram_username
        } : undefined;

        // Use natural language query or default to current month
        const query = params.text || 'earnings this month';
        
        const { generateEarningsPdfForQuery } = await import('../lib/earningsService');
        
        // This would typically be handled by the bot integration for file sending
        // For now, return a message indicating PDF generation is in progress
        return { 
          text: "📄 **Generating Your Earnings PDF Report**\n\nYour personalized earnings report is being created... This may take a moment.\n\n✨ **Your report will include:**\n• Period-specific insights\n• Visual earnings breakdown\n• Professional formatting\n• Complete transaction history\n\n💡 The PDF will be sent to you shortly!",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📊 View Earnings", callback_data: "view_earnings" },
                { text: "🔙 Back", callback_data: "business_dashboard" }
              ]
            ]
          }
        };
      } catch (error) {
        console.error('[handleAction] Natural language PDF generation error:', error);
        return { text: "❌ Failed to generate PDF report. Please try again later." };
      }

    case "business_dashboard":
    case "show_business_dashboard":
      try {
        // Get user info for dashboard
        const actualUserId = await resolveUserId(userId);
        if (!actualUserId) {
          return {
            text: "I couldn't find your account. Please make sure you're registered with the bot.",
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
        return { text: "I couldn't load the business dashboard right now. Please try again later." };
      }

    case "get_spending":
      try {
        // Get user's wallet addresses
        const walletAddresses = await getUserWalletAddresses(userId);
        if (!walletAddresses || walletAddresses.length === 0) {
          return { text: "Your wallet is being set up automatically. Please try again in a moment." };
        }

        // Extract parameters for filtering - use all wallet addresses for comprehensive tracking
        const filter = {
          walletAddresses, // Use all wallet addresses instead of just the first one
          timeframe: params.timeframe || 'allTime',
          token: params.token,
          network: params.network,
          startDate: params.startDate,
          endDate: params.endDate
        };

        // Import spending summary function
        const { getSpendingSummary, formatEarningsForAgent } = await import('../lib/earningsService');

        const summary = await getSpendingSummary(filter);
        if (summary && summary.totalPayments > 0) {
          const formatted = formatEarningsForAgent(summary, 'spending');
          return { text: formatted };
        } else {
          return { text: "You haven't made any withdrawals or crypto conversions yet. Your spending history will appear here once you start using the offramp feature or send crypto to others." };
        }
      } catch (error) {
        console.error('[handleAction] Spending error:', error);
        return { text: "I couldn't fetch your spending data right now. Please try again later." };
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
            text: "User not found. Please make sure you're registered with the bot.",
          };
        }

        const paidItems = await SmartNudgeService.getUserPaidItems(actualUserId);
        const totalPaid = paidItems.paymentLinks.length + paidItems.invoices.length;

        if (totalPaid === 0) {
          return {
            text: "You don't have any paid payment links or invoices yet. Once clients pay your invoices or payment links, they'll appear here for tracking."
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
        return { text: "I couldn't fetch your paid items right now. Please try again later." };
      }

    case "help":
      return {
        text: "Hi! I'm Hedwig, your freelance assistant. Here's what I can help you with:\n\n" +
          "I can help you create wallets, check your balance, get wallet addresses, send crypto to others, view your earnings, create payment links, invoices, and proposals.\n\n" +
          "Just ask me naturally - for example, you can say 'what's my balance?', 'show my wallet address', 'send 0.1 ETH to [address]', 'create payment link for 50 USDC', 'show my earnings', 'create invoice', or 'create proposal'.\n\n" +
          "What would you like to do today?"
      };

    case "welcome":
      return {
        text: "Hi! I'm Hedwig, your freelance assistant.\n\n" +
          "I can help you check wallet balances, get wallet addresses, send crypto, create payment links, view earnings, create invoices, and make proposals.\n\n" +
          "Just ask me naturally - for example, 'what's my balance?', 'show my wallet address', 'send 0.1 ETH to [address]', 'create payment link for 50 USDC', 'show my earnings', 'create invoice', or 'create proposal'.\n\n" +
          "What would you like to do today?"
      };

    case "create_contract":
      console.log('[handleAction] create_contract case triggered with params:', params);
      return await handleCreateContract(params, userId);

    case "create_content":
      console.log('[handleAction] create_content case triggered with params:', params);
      return await handleCreateContent(params, userId);

    case "create_design":
      console.log('[handleAction] create_design case triggered with params:', params);
      return await handleCreateDesign(params, userId);

    case "create_development":
      console.log('[handleAction] create_development case triggered with params:', params);
      return await handleCreateDevelopment(params, userId);

    case "create_marketing":
      console.log('[handleAction] create_marketing case triggered with params:', params);
      return await handleCreateMarketing(params, userId);

    case "create_consulting":
      console.log('[handleAction] create_consulting case triggered with params:', params);
      return await handleCreateConsulting(params, userId);

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

async function handleSendInstructions(params: ActionParams, userId: string) {
  // Always show the send template/instructions for instruction_send intent
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
      "• USDC (Base, Celo, or Solana)\n" +
      "• CELO (Celo network)\n" +
      "• cUSD (Celo network)\n" +
      "• LSK (Lisk network)\n" +
      "• SOL (Solana network)\n\n" +
      "💡 **Tip**: Include all details in one message for faster processing!"
  };
}

async function handleSend(params: ActionParams, userId: string) {
  try {
    console.log(`[handleSend] Starting with params:`, JSON.stringify(params, null, 2));
    console.log(`[handleSend] UserId: ${userId}`);

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
    let { amount, token, to_address, recipient, network, confirm } = params;
    let recipientAddress = to_address || recipient;
    
    // Enhanced parameter extraction from text if not provided directly
    if (params.text && (!amount || !recipientAddress || !token)) {
      console.log('[handleSend] Enhancing parameters from text:', params.text);
      
      // Extract amount and token if not provided
      if (!amount || !token) {
        const amountTokenMatch = params.text.match(/(\d+(?:\.\d+)?)\s*(eth|sol|usdc|usdt|btc|matic|avax|bnb|ada|dot|link|uni|celo|lsk|cusd)/i);
        if (amountTokenMatch) {
          amount = amount || amountTokenMatch[1];
          token = token || amountTokenMatch[2].toUpperCase();
          console.log('[handleSend] Enhanced - amount:', amount, 'token:', token);
        }
      }
      
      // Extract recipient address if not provided
      if (!recipientAddress) {
        const addressMatch = params.text.match(/0x[a-fA-F0-9]{40}/) || 
                            params.text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
        if (addressMatch) {
          recipientAddress = addressMatch[0];
          console.log('[handleSend] Enhanced - recipient:', recipientAddress);
        }
      }
      
      // Extract network if not provided
      if (!network) {
        const networkMatch = params.text.match(/on\s+(base|ethereum|solana|celo|lisk)/i) ||
                            params.text.match(/\b(base|ethereum|solana|celo|lisk)\s+network/i);
        if (networkMatch) {
          network = networkMatch[1].toLowerCase();
          console.log('[handleSend] Enhanced - network:', network);
        }
      }
    }

    // Check if this is a confirmation request
    if (confirm === 'yes' || confirm === 'true' || params.action === 'confirm_send') {
      // User is confirming the transaction - execute it

      // If we have callback_data, try to retrieve stored transaction details
      let storedTransaction: any = null;
      if (params.callback_data && params.callback_data.startsWith('confirm_')) {
        const transactionId = params.callback_data.replace('confirm_', '');
        storedTransaction = await transactionStorage.get(transactionId);

        if (storedTransaction) {
          console.log(`[Actions] Retrieved stored transaction ${transactionId}:`, storedTransaction);
          // Use stored transaction details
          params.amount = storedTransaction.amount;
          params.recipient = storedTransaction.toAddress;
          params.token = storedTransaction.tokenAddress || 'native';
          params.network = storedTransaction.network;
        } else {
          console.log(`[Actions] No stored transaction found for ID: ${transactionId}`);
        }
      }

      // Extract parameters (now potentially updated from storage)
      const finalAmount = params.amount || amount;
      const finalRecipientAddress = params.recipient || recipientAddress;
      const finalToken = params.token || token;
      const finalNetwork = params.network || network;

      if (!finalAmount || !finalRecipientAddress) {
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

      if (finalToken?.toLowerCase() === 'sol' ||
        finalNetwork?.toLowerCase() === 'solana' ||
        isSolanaAddress(finalRecipientAddress)) {
        selectedWallet = wallets.find(w => w.chain === 'solana');
        selectedNetwork = 'solana';
      } else if (finalNetwork?.toLowerCase() === 'celo' ||
        finalNetwork?.toLowerCase() === 'celo-sepolia' ||
        finalToken?.toLowerCase() === 'celo' ||
        finalToken?.toLowerCase() === 'cusd' ||
        (finalToken?.toLowerCase() === 'usdc' && finalNetwork?.toLowerCase() === 'celo')) {
        console.log(`[handleSend] Network selection logic - finalToken: ${finalToken}, finalNetwork: ${finalNetwork}`);
        console.log(`[handleSend] Celo network selection triggered`);
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'celo';
        console.log('[handleSend] Explicitly selected Celo network');
      } else if (finalNetwork?.toLowerCase() === 'lisk' ||
        finalNetwork?.toLowerCase() === 'lisk-sepolia' ||
        finalToken?.toLowerCase() === 'lsk' ||
        finalToken?.toLowerCase() === 'lisk') {
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'lisk';
        console.log('[handleSend] Explicitly selected Lisk network');
      } else if (finalToken?.toLowerCase() === 'usdc' && !finalNetwork) {
        // For USDC without explicit network, check if user has Celo wallet and funds
        console.log('[handleSend] USDC without explicit network - checking Celo balance');
        const evmWallet = wallets.find(w => w.chain === 'evm');
        if (evmWallet) {
          try {
            console.log(`[handleSend] Checking USDC balance on Celo for wallet: ${evmWallet.address}`);
            const celoBalancesResult = await getBalances(evmWallet.address, 'celo');
            console.log('[handleSend] Celo balances result:', celoBalancesResult);

            // Handle both direct array and {data: array} formats
            const celoBalances = celoBalancesResult?.data || celoBalancesResult;
            console.log('[handleSend] Celo balances array:', celoBalances);

            const usdcToken = celoBalances?.find((b: any) =>
              (b.asset?.symbol === 'USDC' || b.symbol === 'USDC') &&
              parseFloat(b.amount || b.balance || '0') > 0
            );
            console.log('[handleSend] USDC token found on Celo:', usdcToken);

            if (usdcToken) {
              selectedWallet = evmWallet;
              selectedNetwork = 'celo';
              console.log('[handleSend] Selected Celo for USDC transfer');
            } else {
              // Default to Base if no USDC found on Celo
              console.log('[handleSend] No USDC on Celo, defaulting to Base');
              selectedWallet = evmWallet;
              selectedNetwork = 'base';
              console.log('[handleSend] Defaulting to Base network');
            }
          } catch (error) {
            // If balance check fails, default to Base
            console.log('[handleSend] Error checking Celo balance, defaulting to Base:', error);
            selectedWallet = evmWallet;
            selectedNetwork = 'base';
          }
        } else {
          selectedWallet = wallets.find(w => w.chain === 'evm');
          selectedNetwork = 'base';
          console.log('[handleSend] No EVM wallet found, defaulting to Base');
        }
      } else {
        // Default to EVM for ETH, etc.
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'base';
      }

      if (!selectedWallet) {
        const networkDisplayName = selectedNetwork === 'solana' ? 'Solana' :
          selectedNetwork === 'celo' ? 'Celo' :
            selectedNetwork === 'lisk' ? 'Lisk' : 'Base';
        return {
          text: `❌ You don't have a ${networkDisplayName} wallet. Please create one first.`
        };
      }

      try {
        let result;
        const fromAddress = selectedWallet.address;

        // Determine if this is a native token transfer or token transfer
        const isNativeToken = (
          (selectedNetwork === 'base' && (!finalToken || finalToken.toLowerCase() === 'eth')) ||
          (selectedNetwork === 'celo' && (!finalToken || finalToken.toLowerCase() === 'celo')) ||
          (selectedNetwork === 'lisk' && (!finalToken || finalToken.toLowerCase() === 'eth')) ||
          (selectedNetwork === 'solana' && (!finalToken || finalToken.toLowerCase() === 'sol'))
        );

        if (isNativeToken) {
          // Native token transfer using CDP API
          result = await transferNativeToken(
            fromAddress,
            finalRecipientAddress,
            finalAmount,
            selectedNetwork
          );
        } else {
          // Token transfer using CDP API
          let tokenAddress;
          let tokenDecimals = 6; // Default for USDC/USDT

          if (finalToken?.toLowerCase() === 'usdc') {
            console.log(`[handleSend] Setting USDC token address for network: ${selectedNetwork}`);
            // Use multi-network service to get correct token address
            tokenAddress = multiNetworkPaymentService.getTokenAddress(selectedNetwork, 'USDC');

            if (!tokenAddress) {
              // Fallback to hardcoded addresses for backward compatibility
              if (selectedNetwork === 'base') {
                tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC
              } else if (selectedNetwork === 'celo') {
                tokenAddress = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'; // Celo Mainnet USDC
              } else if (selectedNetwork === 'solana') {
                tokenAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Solana Mainnet USDC
              } else {
                console.error(`[handleSend] USDC not supported on network: ${selectedNetwork}`);
                return {
                  text: `❌ USDC not supported on ${selectedNetwork}. Please use a supported network.`
                };
              }
            }
            console.log(`[handleSend] Using USDC address for ${selectedNetwork}: ${tokenAddress}`);
          } else if (finalToken?.toLowerCase() === 'usdt') {
            // USDT on Lisk mainnet
            if (selectedNetwork === 'lisk') {
              tokenAddress = '0x05D032ac25d322df992303dCa074EE7392C117b9'; // Bridged USDT on Lisk mainnet
              tokenDecimals = 6; // USDT has 6 decimals
            } else {
              return {
                text: `❌ USDT is only supported on Lisk mainnet. Please use USDT on Lisk or switch to a supported token.`
              };
            }
          } else if (finalToken?.toLowerCase() === 'cusd') {
            // Celo Dollar (cUSD) on Celo mainnet
            if (selectedNetwork === 'celo') {
              tokenAddress = '0x765DE816845861e75A25fCA122bb6898B8B1282a'; // Celo Mainnet cUSD
              tokenDecimals = 18; // cUSD has 18 decimals
            } else {
              return {
                text: `❌ cUSD is only available on Celo network.`
              };
            }
          } else if (finalToken?.toLowerCase() === 'lisk' || finalToken?.toLowerCase() === 'lsk') {
            // LSK token on Lisk L2 mainnet
            if (selectedNetwork === 'lisk') {
              tokenAddress = '0x8a21CF9Ba08Ae709D64Cb25AfAA951183EC9FF6D'; // Lisk L2 Mainnet LSK token
              tokenDecimals = 18; // LSK has 18 decimals
            } else {
              return {
                text: `❌ LSK token is only available on Lisk network.`
              };
            }
          } else {
            return {
              text: `❌ Unsupported token: ${finalToken}. Supported tokens: ETH, USDC, USDT, SOL, CELO, cUSD, LISK`
            };
          }

          console.log(`[handleSend] Calling transferToken with parameters:`);
          console.log(`[handleSend] - fromAddress: ${fromAddress}`);
          console.log(`[handleSend] - finalRecipientAddress: ${finalRecipientAddress}`);
          console.log(`[handleSend] - tokenAddress: ${tokenAddress}`);
          console.log(`[handleSend] - finalAmount: ${finalAmount}`);
          console.log(`[handleSend] - tokenDecimals: ${tokenDecimals}`);
          console.log(`[handleSend] - selectedNetwork: ${selectedNetwork}`);

          result = await transferToken(
            fromAddress,
            finalRecipientAddress,
            tokenAddress,
            finalAmount,
            tokenDecimals,
            selectedNetwork
          );
        }

        // Generate block explorer link
        const explorerUrl = getBlockExplorerUrl(result.hash, selectedNetwork);

        // Format success message
        const networkName = selectedNetwork === 'solana' ? 'Solana' :
          selectedNetwork === 'celo' ? 'Celo' :
            selectedNetwork === 'lisk' ? 'Lisk' : 'Base';
        const tokenSymbol = isNativeToken ?
          (selectedNetwork === 'base' ? 'ETH' :
            selectedNetwork === 'celo' ? 'CELO' :
              selectedNetwork === 'lisk' ? 'ETH' : 'SOL') :
          (finalToken?.toUpperCase() || 'TOKEN');

        // Clean up stored transaction after successful execution
        if (storedTransaction) {
          transactionStorage.remove(storedTransaction.transactionId);
          console.log(`[Actions] Cleaned up stored transaction ${storedTransaction.transactionId}`);
        }

        // Track token_sent event
        try {
          const { HedwigEvents } = await import('../lib/posthog');
          await HedwigEvents.tokensSent(userId, {
            amount: parseFloat(finalAmount),
            token: tokenSymbol,
            recipient: finalRecipientAddress,
            network: networkName.toLowerCase(),
            transaction_hash: result.hash
          });
          console.log('PostHog: Tokens sent event tracked successfully');
        } catch (trackingError) {
          console.error('PostHog tracking error for tokens_sent:', trackingError);
        }

        return {
          text: `✅ **Transfer Successful!**\n\n` +
            `💰 **Amount**: ${finalAmount} ${tokenSymbol}\n` +
            `🌐 **Network**: ${networkName}\n` +
            `📍 **To**: \`${finalRecipientAddress}\`\n` +
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
      } else if (network?.toLowerCase() === 'celo' ||
        network?.toLowerCase() === 'celo-sepolia' ||
        token?.toLowerCase() === 'celo' ||
        token?.toLowerCase() === 'cusd') {
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'celo';
        networkName = 'Celo';
      } else if (network?.toLowerCase() === 'lisk' ||
        network?.toLowerCase() === 'lisk-sepolia' ||
        token?.toLowerCase() === 'lsk' ||
        token?.toLowerCase() === 'lisk') {
        selectedWallet = wallets.find(w => w.chain === 'evm');
        selectedNetwork = 'lisk';
        networkName = 'Lisk';
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

      // Determine native token detection
      const isNativeToken = (
        (selectedNetwork === 'base' && (!token || token.toLowerCase() === 'eth')) ||
        (selectedNetwork === 'celo' && (!token || token.toLowerCase() === 'celo')) ||
        (selectedNetwork === 'lisk' && (!token || token.toLowerCase() === 'eth')) ||
        (selectedNetwork === 'solana' && (!token || token.toLowerCase() === 'sol'))
      );

      const transactionType = isNativeToken ? 'native' : 'token';

      // Estimate gas fee
      let estimatedFee;
      try {
        estimatedFee = await estimateTransactionFee(selectedNetwork, transactionType);
      } catch (error) {
        console.error('[handleSend] Fee estimation error:', error);
        estimatedFee = selectedNetwork.includes('solana') ? '~0.000005 SOL' :
          selectedNetwork === 'lisk' ? '~0.0001 ETH' :
            selectedNetwork === 'celo' ? '~0.0001 CELO' : '~0.0001 ETH';
      }

      // Determine token symbol for display
      const tokenSymbol = isNativeToken ?
        (selectedNetwork === 'base' ? 'ETH' :
          selectedNetwork === 'celo' ? 'CELO' :
            selectedNetwork === 'lisk' ? 'ETH' : 'SOL') :
        (token?.toUpperCase() || 'TOKEN');

      // Truncate addresses for display
      const truncatedRecipient = `${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`;
      const truncatedFrom = `${selectedWallet.address.slice(0, 8)}...${selectedWallet.address.slice(-6)}`;

      // Create a short transaction ID for callback data
      const transactionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

      // Store transaction details temporarily for confirmation
      await transactionStorage.store(transactionId, {
        userId: userId.toString(),
        fromAddress: selectedWallet.address,
        toAddress: recipientAddress,
        amount,
        tokenSymbol: tokenSymbol,
        tokenAddress: token !== 'native' ? token : undefined,
        network: selectedNetwork,
        status: 'pending'
      });

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

    // If we don't have all the information, try to extract from text first
    if (params.text) {
      console.log('[handleSend] Attempting to extract parameters from text:', params.text);
      
      // Try to extract amount and token
      const amountTokenMatch = params.text.match(/(\d+(?:\.\d+)?)\s*(eth|sol|usdc|usdt|btc|matic|avax|bnb|ada|dot|link|uni|celo|lsk|cusd)/i);
      if (amountTokenMatch && !amount) {
        params.amount = amountTokenMatch[1];
        params.token = amountTokenMatch[2].toUpperCase();
        console.log('[handleSend] Extracted from text - amount:', params.amount, 'token:', params.token);
      }
      
      // Try to extract recipient address
      const addressMatch = params.text.match(/0x[a-fA-F0-9]{40}/) || 
                          params.text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/) ||
                          params.text.match(/to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (addressMatch && !recipientAddress) {
        params.recipient = addressMatch[0];
        console.log('[handleSend] Extracted recipient from text:', params.recipient);
      }
      
      // Try to extract network
      const networkMatch = params.text.match(/on\s+(base|ethereum|solana|celo|lisk)/i) ||
                          params.text.match(/\b(base|ethereum|solana|celo|lisk)\s+network/i);
      if (networkMatch && !network) {
        params.network = networkMatch[1].toLowerCase();
        console.log('[handleSend] Extracted network from text:', params.network);
      }
      
      // If we now have the required parameters, try again
      if (params.amount && params.recipient) {
        console.log('[handleSend] Retrying with extracted parameters');
        // Recursively call handleSend with the extracted parameters
        return await handleSend(params, userId);
      }
    }
    
    // If we still don't have the required information, ask for missing details
    const missingDetails: string[] = [];
    if (!amount && !params.amount) missingDetails.push('Amount & Token (e.g., "0.1 ETH", "10 USDC")');
    if (!recipientAddress && !params.recipient) missingDetails.push('Recipient Address');
    
    return {
      text: `💸 **Send Crypto - Missing Information**\n\n` +
        `I need the following details to process your transaction:\n\n` +
        `**Missing:**\n${missingDetails.map(detail => `• ${detail}`).join('\n')}\n\n` +
        `**Example:** \`Send 0.1 ETH to 0x1234...5678\`\n\n` +
        `Please provide all details in your next message.`
    };

  } catch (error) {
    console.error('[handleSend] Error:', error);
    return {
      text: "❌ Failed to process send request. Please try again later."
    };
  }
}

// Extract network from natural language text
function extractNetwork(text: string): string | null {
  const normalizedText = text.toLowerCase().trim();

  if (normalizedText.includes('on base') || normalizedText.includes('base network') || normalizedText.includes('base chain')) {
    return 'base';
  }

  if (normalizedText.includes('on celo') || normalizedText.includes('celo network') || normalizedText.includes('celo chain')) {
    return 'celo';
  }

  return null;
}

async function handleCreatePaymentLink(params: ActionParams, userId: string) {
  console.log('[handleCreatePaymentLink] Called with params:', params, 'userId:', userId);
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
      supabase.from("wallets").select("*").eq("user_id", actualUserId).order("created_at", { ascending: true }),
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
    let { amount, token, network, recipient_email, for: paymentReason, description } = params;
    let finalPaymentReason = paymentReason || description;
    
    console.log('[handleCreatePaymentLink] Initial params:', {
      amount, token, network, recipient_email, paymentReason, description, finalPaymentReason, text: params.text
    });
    
    console.log('[handleCreatePaymentLink] After text extraction:', {
      amount, token, network, recipient_email, finalPaymentReason
    });

    // Always try to extract parameters from the text to supplement what we have
    if (params.text) {
      console.log('[handleCreatePaymentLink] Attempting to extract parameters from text:', params.text);
      
      // Extract amount and token with more flexible patterns
      // Try different patterns for amount and token
      const amountTokenMatch = params.text.match(/(\d+(?:\.\d+)?)\s*(eth|sol|usdc|usdt|btc|matic|avax|bnb|ada|dot|link|uni|celo|lsk|cusd)/i) ||
                               params.text.match(/(\d+(?:\.\d+)?)\s*\$?\s*(usdc|usdt|cusd)/i) ||
                               params.text.match(/\$(\d+(?:\.\d+)?)/i);
      if (amountTokenMatch) {
        amount = amount || amountTokenMatch[1];
        if (amountTokenMatch[2]) {
          token = token || amountTokenMatch[2].toUpperCase();
        } else if (amountTokenMatch[0].includes('$')) {
          token = token || 'USDC'; // Default to USDC for dollar amounts
        }
        console.log('[handleCreatePaymentLink] Extracted from text - amount:', amount, 'token:', token);
      }
      
      // Try to extract just amount if no token found
      if (!amount) {
        const amountOnlyMatch = params.text.match(/(\d+(?:\.\d+)?)/);
        if (amountOnlyMatch) {
          amount = amountOnlyMatch[1];
          console.log('[handleCreatePaymentLink] Extracted amount only:', amount);
        }
      }
      
      // Extract network
      const networkMatch = params.text.match(/on\s+(base|ethereum|solana|celo|lisk)/i) ||
                          params.text.match(/\b(base|ethereum|solana|celo|lisk)\s+network/i);
      if (networkMatch) {
        network = network || networkMatch[1].toLowerCase();
        console.log('[handleCreatePaymentLink] Extracted network from text:', network);
      }
      
      // Extract payment reason/description with more flexible patterns
        const reasonPatterns = [
          /for\s+(.+?)(?:\s+on\s+\w+|\s+send\s+to|\s+to\s+\w+@|$)/i,
          /payment\s+link\s+.*?for\s+(.+?)(?:\s+on\s+\w+|\s+send\s+to|\s+to\s+\w+@|$)/i,
          /\d+\s+\w+\s+.*?for\s+(.+?)(?:\s+on\s+\w+|\s+send\s+to|\s+to\s+\w+@|$)/i,
          /create\s+payment\s+link\s+(.+?)(?:\s+for\s+(.+?))?(?:\s+on\s+\w+|\s+send\s+to|\s+to\s+\w+@|$)/i,
          /payment\s+link\s+(.+?)(?:\s+on\s+\w+|\s+send\s+to|\s+to\s+\w+@|$)/i
        ];
        
        for (const pattern of reasonPatterns) {
          const match = params.text.match(pattern);
          if (match) {
            // Take the longest non-empty match
            const reason = match[2] || match[1];
            if (reason && reason.trim() && !reason.match(/^\d+(\.\d+)?\s*(usdc|eth|sol|usdt|btc|matic|avax|bnb|ada|dot|link|uni|celo|lsk|cusd)$/i)) {
              finalPaymentReason = reason.trim();
              console.log('[handleCreatePaymentLink] Extracted reason from text:', finalPaymentReason);
              break;
            }
          }
        }
        
      // If still no reason found, try to extract from the general context
      if (!finalPaymentReason) {
        // Remove common payment link keywords and see what's left
        let cleanText = params.text
          .replace(/create\s+payment\s+link/gi, '')
          .replace(/payment\s+link/gi, '')
          .replace(/\d+(?:\.\d+)?\s*(usdc|eth|sol|usdt|btc|matic|avax|bnb|ada|dot|link|uni|celo|lsk|cusd)/gi, '')
          .replace(/on\s+(base|ethereum|solana|celo|lisk)/gi, '')
          .replace(/send\s+to\s+\S+@\S+/gi, '')
          .replace(/to\s+\S+@\S+/gi, '')
          .trim();
        
        if (cleanText && cleanText.length > 3) {
          finalPaymentReason = cleanText;
          console.log('[handleCreatePaymentLink] Extracted reason from context:', finalPaymentReason);
        }
      }
      
      // Extract email with better patterns
      const emailMatch = params.text.match(/(?:send\s+to\s+|to\s+|email\s+)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                        params.text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        recipient_email = recipient_email || emailMatch[1];
        console.log('[handleCreatePaymentLink] Extracted email from text:', recipient_email);
      }
    }

    // Set defaults for missing parameters
    if (!amount) {
      // Try to extract amount from any number in the text
      const numberMatch = params.text?.match(/(\d+(?:\.\d+)?)/);
      amount = numberMatch ? numberMatch[1] : '50'; // Default to 50
    }
    
    if (!token) {
      token = 'USDC'; // Default to USDC
    }
    
    if (!finalPaymentReason) {
      finalPaymentReason = 'Payment request'; // Default reason
    }
    
    if (!network) {
      network = 'base'; // Default to base network
    }

    // Only show template if absolutely no useful information was provided
    if (!params.text || params.text.trim().length < 5) {
      return {
        text: "Create Payment Link\n\n" +
          "Please provide the following information:\n\n" +
          "Required Details:\n" +
          "• Amount: e.g., `100 USDC`\n" +
          "• Purpose: What the payment is for\n" +
          "• Network: `base` or `celo` (required)\n" +
          "• Recipient Email (optional): To send the link via email\n\n" +
          "Example Messages:\n" +
          "• `Create payment link for 100 USDC on base for web development`\n" +
          "• `Payment link 50 USDC on celo for consulting services`\n" +
          "• `Link for 25 USDC on base for design work, send to client@example.com`\n\n" +
          "Supported Networks:\n" +
          "• 🔵 Base Network - Lower fees, faster transactions\n" +
          "• 🟢 Celo Network - Mobile-friendly payments\n\n" +
          "Tip: Include all details in one message for faster processing!"
      };
    }

    // Check if network is specified, if not ask for it
    if (!network) {
      return {
        text: `Payment Link Details Confirmed ✅\n\n` +
          `💰 **Amount:** ${amount} ${token}\n` +
          `📝 **Reason:** ${finalPaymentReason}\n` +
          `${recipient_email ? `📧 **Email:** ${recipient_email}\n` : ''}` +
          `\n🔗 **Choose Blockchain Network:**\n\n` +
          `🔵 **Base Network** - Lower fees, faster transactions\n` +
          `🟢 **Celo Network** - Mobile-friendly payments\n\n` +
          `Please specify which network:\n` +
          `• "Create payment link for ${amount} ${token} on **base** for ${finalPaymentReason}"\n` +
          `• "Create payment link for ${amount} ${token} on **celo** for ${finalPaymentReason}"`
      };
    }

    // Set default values
    const selectedNetwork = network?.toLowerCase();
    const selectedToken = token?.toUpperCase() || 'USDC';
    const userName = user?.name || 'Hedwig User';

    // Validate network and token
    const supportedNetworks = ['base', 'celo'];
    const supportedTokens = ['USDC', 'USDT', 'CUSD', 'CELO']; // Network-specific tokens

    if (!supportedNetworks.includes(selectedNetwork)) {
      return {
        text: `❌ Unsupported network: ${selectedNetwork}\n\nSupported networks:\n🔵 Base Network (base)\n🟢 Celo Network (celo)`
      };
    }

    // Validate token for selected network
    const networkTokens = multiNetworkPaymentService.getNetworkConfig(selectedNetwork)?.tokens;
    if (!networkTokens || !networkTokens[selectedToken]) {
      const availableTokens = networkTokens ? Object.keys(networkTokens).join(', ') : 'USDC';
      return {
        text: `❌ Token ${selectedToken} not supported on ${selectedNetwork} network.\n\nAvailable tokens on ${selectedNetwork}: ${availableTokens}`
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

      let successMessage = `Payment Link Created Successfully!\n\n` +
        `Amount: ${amount} ${selectedToken}\n` +
        `Network: ${selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1)}\n` +
        `For: ${finalPaymentReason}\n` +
        `Wallet: \`${evmWallet.address.slice(0, 8)}...${evmWallet.address.slice(-6)}\`\n\n` +
        `Payment Link: ${paymentUrl}\n\n`;

      if (recipient_email) {
        successMessage += `Email sent to: ${recipient_email}\n\n`;
      }

      successMessage += `Share this link with anyone who needs to pay you!\n` +
        `Link expires in 7 days\n\n` +
        `You'll be notified when payments are received.`;

      return {
        text: successMessage,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Open Payment Link", url: paymentUrl },
              { text: "View Earnings", callback_data: "view_earnings" }
            ]
          ]
        }
      };

    } catch (error) {
      console.error('[handleCreatePaymentLink] API call error:', error);
      return {
        text: `Failed to create payment link\n\n` +
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
      text: "Failed to process payment link request. Please try again later."
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
    const searchByEmail = params.searchByEmail;
    const requiresSelection = params.requiresSelection;
    const showList = params.showList; // New parameter to show list of items

    // Handle showList parameter - display specific type of items
    if (showList && targetType) {
      const items = await SmartNudgeService.getUserRemindableItems(userId);

      if (targetType === 'payment_link') {
        if (items.paymentLinks.length === 0) {
          return {
            text: "📭 You don't have any unpaid payment links to send reminders for."
          };
        }

        let selectionText = '💳 **Select a Payment Link to send reminder:**\n\n';
        const inlineKeyboard: Array<Array<{
          text: string;
          callback_data?: string;
          url?: string;
          copy_text?: { text: string };
        }>> = [];

        items.paymentLinks.forEach((link, index) => {
          selectionText += `${index + 1}. **${link.title}** - $${link.amount}\n   📧 ${link.clientEmail}\n\n`;
          inlineKeyboard.push([{
            text: `💳 ${link.title} ($${link.amount})`,
            callback_data: `remind_payment_link_${link.id}`
          }]);
        });

        selectionText += '👆 **Select a payment link above to send reminder.**';

        return {
          text: selectionText,
          reply_markup: {
            inline_keyboard: inlineKeyboard
          }
        };
      } else if (targetType === 'invoice') {
        if (items.invoices.length === 0) {
          return {
            text: "📭 You don't have any unpaid invoices to send reminders for."
          };
        }

        let selectionText = '📄 **Select an Invoice to send reminder:**\n\n';
        const inlineKeyboard: Array<Array<{
          text: string;
          callback_data?: string;
          url?: string;
          copy_text?: { text: string };
        }>> = [];

        items.invoices.forEach((invoice, index) => {
          selectionText += `${index + 1}. **${invoice.title}** - $${invoice.amount}\n   📧 ${invoice.clientEmail}\n\n`;
          inlineKeyboard.push([{
            text: `📄 ${invoice.title} ($${invoice.amount})`,
            callback_data: `remind_invoice_${invoice.id}`
          }]);
        });

        selectionText += '👆 **Select an invoice above to send reminder.**';

        return {
          text: selectionText,
          reply_markup: {
            inline_keyboard: inlineKeyboard
          }
        };
      }
    }

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

    // Handle email-based search with selection interface
    if (searchByEmail && clientEmail) {
      const items = await SmartNudgeService.getUserRemindableItems(userId);

      // Filter items by client email
      const matchingPaymentLinks = items.paymentLinks.filter(link =>
        link.clientEmail.toLowerCase() === clientEmail.toLowerCase()
      );
      const matchingInvoices = items.invoices.filter(invoice =>
        invoice.clientEmail.toLowerCase() === clientEmail.toLowerCase()
      );

      if (matchingPaymentLinks.length === 0 && matchingInvoices.length === 0) {
        return {
          text: `📭 No unpaid invoices or payment links found for **${clientEmail}**.\n\nMake sure the email address is correct and that there are pending payments for this client.`
        };
      }

      // Create interactive selection interface
      let selectionText = `🔍 **Found items for ${clientEmail}:**\n\n`;
      const inlineKeyboard: Array<Array<{
        text: string;
        callback_data?: string;
        url?: string;
        copy_text?: { text: string };
      }>> = [];

      if (matchingPaymentLinks.length > 0) {
        selectionText += '💳 **Payment Links:**\n';
        matchingPaymentLinks.forEach((link, index) => {
          selectionText += `${index + 1}. ${link.title} - $${link.amount}\n`;
          inlineKeyboard.push([{
            text: `💳 ${link.title} ($${link.amount})`,
            callback_data: `remind_payment_link_${link.id}${customMessage ? `_msg_${Buffer.from(customMessage).toString('base64')}` : ''}`
          }]);
        });
        selectionText += '\n';
      }

      if (matchingInvoices.length > 0) {
        selectionText += '📄 **Invoices:**\n';
        matchingInvoices.forEach((invoice, index) => {
          selectionText += `${index + 1}. ${invoice.title} - $${invoice.amount}\n`;
          inlineKeyboard.push([{
            text: `📄 ${invoice.title} ($${invoice.amount})`,
            callback_data: `remind_invoice_${invoice.id}${customMessage ? `_msg_${Buffer.from(customMessage).toString('base64')}` : ''}`
          }]);
        });
      }

      selectionText += '\n👆 **Select an item above to send a reminder.**';

      return {
        text: selectionText,
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      };
    }

    // If we have a client email but no specific target, find the most recent unpaid item for that client
    if (clientEmail && !targetId && !searchByEmail) {
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

    // If still no specific target, show selection interface with callback buttons
    if (!targetType || !targetId) {
      const items = await SmartNudgeService.getUserRemindableItems(userId);

      if (items.paymentLinks.length === 0 && items.invoices.length === 0) {
        return {
          text: "📭 You don't have any unpaid payment links or invoices to send reminders for.\n\n💡 **Tip:** Create payment links or invoices first, then you can send reminders to your clients."
        };
      }

      // Create selection interface with callback buttons - always show both options
      let selectionText = '📋 **Choose what type of reminder to send:**\n\n';
      const inlineKeyboard: Array<Array<{
        text: string;
        callback_data?: string;
        url?: string;
        copy_text?: { text: string };
      }>> = [];

      // Always show payment links option
      selectionText += `💳 **Payment Links:** ${items.paymentLinks.length} unpaid\n`;
      inlineKeyboard.push([{
        text: `💳 Payment Links (${items.paymentLinks.length})`,
        callback_data: 'select_payment_links_for_reminder'
      }]);

      // Always show invoices option
      selectionText += `📄 **Invoices:** ${items.invoices.length} unpaid\n`;
      inlineKeyboard.push([{
        text: `📄 Invoices (${items.invoices.length})`,
        callback_data: 'select_invoices_for_reminder'
      }]);

      selectionText += '\n👆 **Select the type above to see available items.**';


      return {
        text: selectionText,
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
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
        .eq('created_by', userId)
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
    } else if (reminderType === 'due_date' && targetType === 'payment_link') {
      // Use PaymentLinkReminderService for due date reminders on payment links
      const { data: paymentLink } = await supabase
        .from('payment_links')
        .select('*')
        .eq('id', targetId)
        .eq('created_by', userId)
        .single();

      if (!paymentLink) {
        return {
          text: "❌ Payment link not found or you don't have permission to send reminders for it."
        };
      }

      result = await PaymentLinkReminderService.sendDueDateReminder(paymentLink, 'manual');

      if (result.success) {
        result.message = `Due date reminder sent to ${paymentLink.recipient_email} for payment link ${paymentLink.payment_reason || paymentLink.id}`;
      } else {
        result.message = result.error || 'Failed to send due date reminder';
      }
    } else {
      // Use SmartNudgeService for standard reminders
      result = await SmartNudgeService.sendManualReminder(targetType as 'payment_link' | 'invoice', targetId, customMessage);
    }

    if (result.success) {
      return {
        text: `Reminder sent successfully!\n\n${result.message}`
      };
    } else {
      return {
        text: `Failed to send reminder: ${result.message}`
      };
    }
  } catch (error) {
    console.error('[sendManualReminder] Error:', error);
    return {
      text: "Failed to send reminder. Please try again later."
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
        text: "Telegram chat ID not found. Please make sure you're using the Telegram bot."
      };
    }

    // Initialize the bot and start invoice creation directly (calendar disabled)
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    const { BotIntegration } = await import('../modules/bot-integration');

    const botIntegration = new BotIntegration(bot);
    await botIntegration.handleInvoiceCreationWithCalendarSuggestion(user.telegram_chat_id, actualUserId);

    // Return empty text to avoid interrupting the flow
    return {
      text: ""
    };

  } catch (error) {
    console.error('[handleCreateInvoice] Error:', error);
    return {
      text: "Failed to start invoice creation. Please try again later."
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
        text: "Telegram chat ID not found. Please make sure you're using the Telegram bot."
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
      text: "Failed to start proposal creation. Please try again later."
    };
  }
}

async function handleCreateContract(params: ActionParams, userId: string) {
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
        console.error(`[handleCreateContract] Failed to find user with username ${userId}:`, userError);
        return {
          text: "❌ User not found. Please make sure you're registered with the bot.",
        };
      }

      actualUserId = user.id;
    }

    // Get the user's chat ID for Telegram interaction
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', actualUserId)
      .single();

    if (!user?.telegram_chat_id) {
      return {
        text: "Telegram chat ID not found. Please make sure you're using the Telegram bot."
      };
    }

    // Use the global bot integration instance from webhook
    // This ensures we use the same ContractModule instance that tracks state
    const { getBotIntegration } = await import('../pages/api/webhook');
    const botIntegration = getBotIntegration();
    
    if (!botIntegration) {
      console.error('[handleCreateContract] Bot integration not available');
      return {
        text: "Bot integration not available. Please try again later."
      };
    }

    const contractModule = botIntegration.getContractModule();
    if (!contractModule) {
      console.error('[handleCreateContract] Contract module not available');
      return {
        text: "Contract module not available. Please try again later."
      };
    }

    console.log('[handleCreateContract] Starting contract creation for user:', actualUserId, 'chatId:', user.telegram_chat_id);
    await contractModule.startContractCreation(user.telegram_chat_id, actualUserId);

    // Return empty text to avoid interrupting the flow
    return {
      text: ""
    };

  } catch (error) {
    console.error('[handleCreateContract] Error:', error);
    return {
      text: "Failed to start contract creation. Please try again later."
    };
  }
}

// Handle onramp intent - buy crypto with fiat (route through bot-integration)
async function handleOnramp(params: ActionParams, userId: string): Promise<ActionResult> {
  console.log('[handleOnramp] Called with params:', params, 'userId:', userId);

  // Return "coming soon" message for now
  return {
    text: '🚧 **Buy Crypto Feature Coming Soon**\n\n' +
      'We\'re working hard to bring you a seamless cryptocurrency purchase experience! This feature will be available soon.\n\n' +
      '🔔 **What to expect:**\n' +
      '• Buy crypto with your local currency\n' +
      '• Secure and compliant transactions\n' +
      '• Competitive exchange rates\n' +
      '• Multiple payment methods\n\n' +
      'In the meantime, you can:\n' +
      '• Check your wallet balance\n' +
      '• Send crypto to others\n' +
      '• Create invoices and payment links\n\n' +
      'Stay tuned for updates! 🚀'
  };
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

    // Handle callback data for session navigation (check both callback_data and callbackData)
    const callbackData = params.callback_data || params.callbackData;
    if (callbackData) {
      console.log(`[handleOfframp] Processing callback: ${callbackData}`);

      // Extract session ID from callback data if present (format: action_sessionId)
      let session: any = null;
      let sessionId: string | null = null;
      let cleanCallbackData = callbackData;

      // Check if callback data contains a session ID (ends with underscore + UUID)
      const sessionIdMatch = callbackData.match(/^(.+)_([a-f0-9-]{36})$/);
      if (sessionIdMatch) {
        cleanCallbackData = sessionIdMatch[1];
        sessionId = sessionIdMatch[2];
        console.log(`[handleOfframp] Extracted session ID: ${sessionId} from callback: ${callbackData}`);

        // Get session by ID instead of searching for active session
        session = await offrampSessionService.getSessionById(sessionId!);
        if (!session) {
          console.log(`[handleOfframp] Session ${sessionId} not found or expired`);
          return {
            text: "❌ Session expired. Please start a new withdrawal by typing 'offramp' or using the /offramp command.",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🏦 Start New Withdrawal", callback_data: "action_offramp" }]
              ]
            }
          };
        }
      } else {
        // Fallback to active session lookup for legacy callbacks
        session = await offrampSessionService.getActiveSession(actualUserId);
      }

      console.log(`[handleOfframp] Callback ${cleanCallbackData} - Session found:`, session ? `${session.id} (step: ${session.step})` : 'null');
      const result = await handleOfframpCallback(cleanCallbackData, actualUserId, session);
      console.log(`[handleOfframp] Callback processed, returning result`);
      return result;
    }

    console.log(`[handleOfframp] No callback data, processing text input: "${params.text}"`);

    // If no text is provided, start a new offramp flow
    if (!params.text || params.text === 'undefined' || params.text.trim() === '') {
      console.log('[handleOfframp] No text input provided, starting new offramp flow');
      return await startOfframpFlow(actualUserId);
    }

    // Check for existing session first
    let session = await offrampSessionService.getActiveSession(actualUserId);
    console.log(`[handleOfframp] Session check for text input - Session found:`, session ? `${session.id} (step: ${session.step})` : 'null');

    // If there's an existing session, continue with it (for text input like account numbers)
    // BUT only if the text is not a command to start fresh offramp
    if (session && params.text && !params.text.toLowerCase().includes('offramp')) {
      console.log('[handleOfframp] Continuing existing session with text input');
      return await handleOfframpStep(session, params, actualUserId);
    }

    // Clear session only when starting completely fresh (no existing session or explicit new start)
    if (session && params.text && params.text.toLowerCase().includes('offramp')) {
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
          token: 'USDC' // Default token, can be changed in token selection step
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
          token: 'USDC' // Default token, can be changed in token selection step
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
                { text: "🇬🇭 Bank Account (GHS)", callback_data: "payout_bank_ghs" }
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

    // If we reach here, something unexpected happened
    return {
      text: "❌ An unexpected error occurred. Please try starting a new withdrawal."
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
async function validateOfframpAmount(amount: number, userId: string): Promise<{ valid: boolean, response?: ActionResult }> {
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

// Helper function to generate callback data with session ID
function generateCallbackData(action: string, sessionId?: string): string {
  return sessionId ? `${action}_${sessionId}` : action;
}

// Start new offramp flow - Network selection first
async function startOfframpFlow(userId: string): Promise<ActionResult> {
  try {
    // Get user wallets to ensure they exist
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', userId);

    if (walletsError || !wallets || wallets.length === 0) {
      return {
        text: "Your wallets are being set up automatically. Please try again in a moment."
      };
    }

    // Create new session with network_selection step
    const session = await offrampSessionService.createSession(userId, 'network_selection');

    return {
      text: `🏦 **USDC/USDT Withdrawal - Step 1 of 5**\n\n` +
        `💡 **Select the network you want to withdraw from:**\n\n` +
        `🔵 **Base Network** - USDC, cNGN\n` +
        `🟢 **Celo Network** - USDC, cUSD\n` +
        `🟣 **Lisk Network** - USDT\n\n` +
        `We'll check your balance on the selected network and proceed with the withdrawal.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔵 Base Network", callback_data: generateCallbackData("offramp_network_base", session.id) },
            { text: "🟢 Celo Network", callback_data: generateCallbackData("offramp_network_celo", session.id) }
          ],
          [
            { text: "🟣 Lisk Network", callback_data: generateCallbackData("offramp_network_lisk", session.id) }
          ],
          [
            { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
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
      case 'network_selection':
        return await handleNetworkSelectionStep(session, params, userId);
      case 'amount':
        return await handleAmountStep(session, params, userId);
      case 'chain_selection':
        return await handleChainSelectionStep(session, params, userId);
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
      const stepParams = { callback_data: callbackData };
      return await handleOfframpStep(session, stepParams, userId);
    }

    if (callbackData === 'offramp_restart' && session) {
      // Go back to network selection step
      await offrampSessionService.updateSession(session.id, 'network_selection', {});
      const stepParams = { callback_data: callbackData };
      return await handleOfframpStep(session, stepParams, userId);
    }

    // Handle action_offramp callback to start new flow
    if (callbackData === 'action_offramp') {
      return await startOfframpFlow(userId);
    }

    // Handle network selection callbacks only if there's an active session
    if (callbackData === 'offramp_network_base' || callbackData === 'offramp_network_celo' || callbackData === 'offramp_network_lisk') {
      if (!session) {
        return {
          text: "❌ Session expired. Please start a new withdrawal by typing 'offramp' or using the /offramp command.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏦 Start New Withdrawal", callback_data: "action_offramp" }]
            ]
          }
        };
      }
      const stepParams = { callback_data: callbackData };
      return await handleOfframpStep(session, stepParams, userId);
    }

    // Handle step-specific callbacks by routing to appropriate step handler
    if (session) {
      const stepParams = { callback_data: callbackData };
      return await handleOfframpStep(session, stepParams, userId);
    }

    return {
      text: "❌ Session expired. Please start a new withdrawal by typing 'offramp' or using the /offramp command."
    };

  } catch (error) {
    console.error('[handleOfframpCallback] Error:', error);
    return {
      text: "❌ An error occurred. Please try again."
    };
  }
}

// Handle network selection step
async function handleNetworkSelectionStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    const callbackData = params.callback_data;

    // If no specific network callback, show the network selection menu
    if (!callbackData || callbackData === 'offramp_restart') {
      return {
        text: `🏦 **USDC/USDT Withdrawal - Step 1 of 5**\n\n` +
          `💡 **Select the network you want to withdraw from:**\n\n` +
          `🔵 **Base Network** - USDC, cNGN\n` +
          `🟢 **Celo Network** - USDC, cUSD\n` +
          `🟣 **Lisk Network** - USDT\n\n` +
          `We'll check your balance on the selected network and proceed with the withdrawal.`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔵 Base Network", callback_data: generateCallbackData("offramp_network_base", session.id) },
              { text: "🟢 Celo Network", callback_data: generateCallbackData("offramp_network_celo", session.id) }
            ],
            [
              { text: "🟣 Lisk Network", callback_data: generateCallbackData("offramp_network_lisk", session.id) }
            ],
            [
              { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
            ]
          ]
        }
      };
    }

    // Parse network selection from callback
    let selectedNetwork: string;
    let networkDisplayName: string;
    let supportedTokens: string[];

    if (callbackData === 'offramp_network_base') {
      selectedNetwork = 'base';
      networkDisplayName = 'Base Network';
      supportedTokens = ['USDC', 'cNGN'];
    } else if (callbackData === 'offramp_network_celo') {
      selectedNetwork = 'celo';
      networkDisplayName = 'Celo Network';
      supportedTokens = ['USDC', 'cUSD'];
    } else if (callbackData === 'offramp_network_lisk') {
      selectedNetwork = 'lisk';
      networkDisplayName = 'Lisk Network';
      supportedTokens = ['USDT'];
    } else {
      return {
        text: "❌ Invalid network selection. Please try again.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Map networks to their corresponding blockchain chains
    const networkToChainMap: { [key: string]: string } = {
      'base': 'evm',
      'celo': 'evm',
      'lisk': 'evm'
    };

    const requiredChain = networkToChainMap[selectedNetwork];
    if (!requiredChain) {
      return {
        text: "❌ Unsupported network selected. Please try again.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Check balance on selected network
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', userId);

    if (walletsError || !wallets || wallets.length === 0) {
      return {
        text: "❌ No wallets found. Please create a wallet first.",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Get balance for the selected network
    let totalBalance = 0;
    const balanceDetails: string[] = [];

    console.log(`[handleNetworkSelectionStep] Checking balances for network: ${selectedNetwork} (requires chain: ${requiredChain})`);
    console.log(`[handleNetworkSelectionStep] Supported tokens: ${supportedTokens.join(', ')}`);
    console.log(`[handleNetworkSelectionStep] Found ${wallets.length} wallets`);

    for (const wallet of wallets) {
      console.log(`[handleNetworkSelectionStep] Checking wallet: ${wallet.address}, chain: ${wallet.chain}`);
      if (wallet.chain === requiredChain) {
        console.log(`[handleNetworkSelectionStep] Wallet matches selected network, getting balances...`);
        try {
          const balancesResponse = await getBalances(wallet.address, selectedNetwork);
          console.log(`[handleNetworkSelectionStep] Raw balances response:`, JSON.stringify(balancesResponse, null, 2));

          // Extract the data array from the response
          const balances = balancesResponse?.data || [];
          console.log(`[handleNetworkSelectionStep] Extracted balances array:`, JSON.stringify(balances, null, 2));

          for (const balance of balances) {
            const symbol = balance.asset.symbol?.toUpperCase();
            console.log(`[handleNetworkSelectionStep] Processing balance for symbol: ${symbol}, raw amount: ${balance.amount}`);

            if (supportedTokens.includes(symbol)) {
              console.log(`[handleNetworkSelectionStep] Symbol ${symbol} is supported`);
              const decimals = balance.asset.decimals || 6;
              let rawAmount: bigint;
              if (typeof balance.amount === 'string' && balance.amount.startsWith('0x')) {
                rawAmount = BigInt(balance.amount);
              } else {
                rawAmount = BigInt(balance.amount || '0');
              }
              const balanceAmount = Number(rawAmount) / Math.pow(10, decimals);
              console.log(`[handleNetworkSelectionStep] Calculated balance: ${balanceAmount} ${symbol} (decimals: ${decimals})`);
              totalBalance += balanceAmount;

              if (balanceAmount > 0) {
                balanceDetails.push(`${formatBalance(balanceAmount.toString())} ${symbol}`);
              }
            } else {
              console.log(`[handleNetworkSelectionStep] Symbol ${symbol} is NOT supported`);
            }
          }
        } catch (error) {
          console.error(`[handleNetworkSelectionStep] Error getting balance for wallet ${wallet.address}:`, error);
        }
      } else {
        console.log(`[handleNetworkSelectionStep] Wallet chain ${wallet.chain} does not match required chain ${requiredChain} for network ${selectedNetwork}`);
      }
    }

    console.log(`[handleNetworkSelectionStep] Final totalBalance: ${totalBalance}`);
    console.log(`[handleNetworkSelectionStep] Balance details: ${balanceDetails.join(', ')}`);

    if (totalBalance === 0) {
      return {
        text: `❌ **No Balance Found**\n\n` +
          `You don't have any ${supportedTokens.join(' or ')} balance on ${networkDisplayName}.\n\n` +
          `Please deposit tokens to your wallet first or select a different network.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Select Different Network", callback_data: "offramp_restart" }],
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Update session with selected network and proceed to amount step
    await offrampSessionService.updateSession(session.id, 'amount', {
      selected_network: selectedNetwork,
      available_balance: totalBalance,
      supported_tokens: supportedTokens
    });

    return {
      text: `✅ **${networkDisplayName} Selected**\n\n` +
        `💰 **Available Balance:**\n${balanceDetails.join('\n')}\n\n` +
        `💡 **Step 2 of 5: Enter Withdrawal Amount**\n\n` +
        `Please enter the amount you want to withdraw (minimum: $1 USD):`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
        ]
      }
    };

  } catch (error) {
    console.error('[handleNetworkSelectionStep] Error:', error);
    return {
      text: "❌ An error occurred while checking your balance. Please try again.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
        ]
      }
    };
  }
}

// Handle amount input step
async function handleAmountStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    // Get selected network from session
    const selectedNetwork = session.data?.selected_network;
    const availableBalance = session.data?.available_balance || 0;
    const supportedTokens = session.data?.supported_tokens || [];

    if (!selectedNetwork) {
      // No network selected, restart flow
      await offrampSessionService.updateSession(session.id, 'network_selection', {});
      return await startOfframpFlow(userId);
    }

    const amountText = params.text?.trim();
    if (!amountText) {
      return {
        text: `❌ Please enter the amount you want to withdraw.\n\nExample: 50 or 100.5\n\nAvailable balance: ${formatBalance(availableBalance.toString())} ${supportedTokens.join('/')}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // Parse amount from text (simple number parsing since network is already selected)
    const amountMatch = amountText.match(/(\d+(?:\.\d+)?)/);

    if (!amountMatch) {
      return {
        text: `❌ Please enter a valid number.\n\nExample: 50 or 100.5\n\nAvailable balance: ${formatBalance(availableBalance.toString())} ${supportedTokens.join('/')}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    const amount = parseFloat(amountMatch[1]);

    if (isNaN(amount) || amount <= 0) {
      return {
        text: `❌ Please enter a valid positive amount.\n\nExample: 50 or 100.5\n\nAvailable balance: ${formatBalance(availableBalance.toString())} ${supportedTokens.join('/')}`,
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

    // Check if user has sufficient balance on selected network
    if (amount > availableBalance) {
      const networkDisplayName = selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1);
      return {
        text: `❌ **Insufficient Balance**\n\n` +
          `Requested: ${amount} ${supportedTokens.join('/')}\n` +
          `Available: ${formatBalance(availableBalance.toString())} ${supportedTokens.join('/')}\n` +
          `Network: ${networkDisplayName}\n\n` +
          `Please enter a lower amount.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Select Different Network", callback_data: "offramp_restart" }],
            [{ text: "❌ Cancel", callback_data: "offramp_cancel" }]
          ]
        }
      };
    }

    // User has sufficient balance, proceed to payout method
    await offrampSessionService.updateSession(session.id, 'payout_method', {
      ...session.data,
      amount: amount,
      token: supportedTokens[0] // Use the first supported token
    });

    const networkDisplayName = selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1);
    return {
      text: `🏦 **Withdrawal - Step 3 of 5**\n\n` +
        `💰 **Amount:** ${amount} ${supportedTokens[0]}\n` +
        `🔗 **Network:** ${networkDisplayName}\n\n` +
        `💳 **Choose your payout method:**`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🇳🇬 Bank Account (NGN)", callback_data: "payout_bank_ngn" }
          ],
          [
            { text: "🇬🇭 Bank Account (GHS)", callback_data: "payout_bank_ghs" }
          ],
          [
            { text: "⬅️ Back", callback_data: "offramp_restart" },
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

// Handle chain selection step
async function handleChainSelectionStep(session: any, params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    console.log('[handleChainSelectionStep] Called with callback_data:', params.callback_data);

    // Parse chain selection callback data (format: chain_select_<chain>_<amount>)
    if (params.callback_data && params.callback_data.startsWith('chain_select_')) {
      const parts = params.callback_data.split('_');
      if (parts.length >= 4) {
        const selectedChain = parts[2]; // chain name
        const amount = parseFloat(parts[3]); // amount

        // Update session with selected chain and move to payout method
        await offrampSessionService.updateSession(session.id, 'payout_method', {
          amount: amount,
          token: 'USDC',
          selected_chain: selectedChain
        });

        const chainName = selectedChain.charAt(0).toUpperCase() + selectedChain.slice(1);
        return {
          text: `🏦 **Multi-Chain USDC Withdrawal - Step 3 of 5**\n\n` +
            `💰 **Amount:** ${amount} USDC\n` +
            `🔗 **Chain:** ${chainName}\n\n` +
            `💳 **Choose your payout method:**\n\n` +
            `We support bank account withdrawals to:`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🇳🇬 Bank Account (NGN)", callback_data: "payout_bank_ngn" }
              ],
              [
                { text: "🇬🇭 Bank Account (GHS)", callback_data: "payout_bank_ghs" }
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

    // If no valid callback data, show error and restart
    return {
      text: "❌ Invalid chain selection. Please try again.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Restart", callback_data: "action_offramp" }]
        ]
      }
    };

  } catch (error) {
    console.error('[handleChainSelectionStep] Error:', error);
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
              { text: "🇳🇬 Bank Account (NGN)", callback_data: generateCallbackData("payout_bank_ngn", session.id) }
            ],
            [
              { text: "🇬🇭 Bank Account (GHS)", callback_data: generateCallbackData("payout_bank_ghs", session.id) }
            ],
            [
              { text: "⬅️ Back", callback_data: generateCallbackData("offramp_edit", session.id) },
              { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
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
    } else if (params.callback_data === 'payout_bank_ghs') {
      currency = 'GHS';
      currencyFlag = '🇬🇭';
      currencyName = 'Ghanaian Cedi';
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
                { text: "⬅️ Back", callback_data: generateCallbackData("back_to_banks", session.id) },
                { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
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
                { text: "⬅️ Back", callback_data: generateCallbackData("back_to_payout", session.id) },
                { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
              ]
            ]
          }
        };
      }

      const bankButtons = supportedBanks.map(bank => [
        { text: bank.name, callback_data: generateCallbackData(`select_bank_${bank.code}_${bank.name}_${currency}`, session.id) }
      ]);

      bankButtons.push([
        { text: "⬅️ Back", callback_data: generateCallbackData("back_to_payout", session.id) },
        { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
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
              { text: "⬅️ Back", callback_data: generateCallbackData("back_to_banks", session.id) },
              { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
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
              { text: "⬅️ Back", callback_data: generateCallbackData("back_to_banks", session.id) },
              { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
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
                { text: "⬅️ Back", callback_data: generateCallbackData("back_to_banks", session.id) },
                { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
              ]
            ]
          }
        };
      }

      // Get exchange rate directly from Paycrest API
      let exchangeRate;
      let fiatAmount;
      const sessionCurrency = session.data.currency || 'NGN'; // Default to NGN if not set
      const currencySymbol = sessionCurrency === 'NGN' ? '₦' : sessionCurrency === 'GHS' ? '₵' : sessionCurrency;

      try {
        // Use the offrampService to get exchange rates - this returns the actual rate per USDC
        const rates = await offrampService.getExchangeRates("USDC", 1, sessionCurrency); // Get rate for 1 USDC in the selected currency
        if (rates[sessionCurrency]) {
          exchangeRate = rates[sessionCurrency]; // This is the actual rate per USDC from Paycrest
          fiatAmount = exchangeRate * session.data.amount; // Calculate total fiat amount
          console.log(`[handleAccountNumberStep] Exchange rate from Paycrest: ${currencySymbol}${exchangeRate.toFixed(2)} per USDC`);
          console.log(`[handleAccountNumberStep] Calculated amount: ${session.data.amount} USDC = ${currencySymbol}${fiatAmount.toFixed(2)}`);
        } else {
          throw new Error(`${sessionCurrency} rate not available`);
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
      const feeInFiat = feeInUsdc * exchangeRate; // Convert fee to local currency for final amount calculation
      const finalAmount = fiatAmount - feeInFiat;

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
          `💱 **Rate:** ${currencySymbol}${exchangeRate.toFixed(2)} per USDC\n` +
          `💵 **Gross Amount:** ${currencySymbol}${fiatAmount.toLocaleString()}\n` +
          `💸 **Fee (1%):** ${feeInUsdc.toFixed(2)} USDC\n` +
          `💳 **Net Amount:** ${currencySymbol}${finalAmount.toLocaleString()}\n\n` +
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
          token: session.data.token || 'USDC', // Use session token or default to USDC
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
                { text: "✅ Yes, Transfer Tokens", callback_data: generateCallbackData("offramp_final_confirm", session.id) },
                { text: "❌ Cancel", callback_data: generateCallbackData("offramp_cancel", session.id) }
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
          token: session.data.token || 'USDC', // Use session token or default to USDC
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
            `• Your USDC is being transferred to our partners\n` +
            `• Order is being processed by our partners\n` +
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

        // Update the session to reflect the error and clear it
        if (session && session.id) {
          await offrampSessionService.updateSession(session.id, 'completed', {
            ...session.data,
            status: 'error',
            error: errorMessage,
          });
          
          // Clear the session so user can start fresh after an error
          await offrampSessionService.clearSession(session.id);
          console.log(`[handleFinalConfirmationStep] Cleared failed offramp session after order error: ${session.id}`);
        } else {
          console.error('[handleFinalConfirmationStep] Cannot update session with error - invalid session:', session);
        }

        return {
          text: `❌ An error occurred while creating your order: ${errorMessage}\n\n` +
            `Please start a new withdrawal by typing 'offramp' or using the /offramp command.`
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
          token: session.data.token || 'USDC' // Use session token or default to USDC
        };

        const transferResult = await offrampService.executeTokenTransfer(transferRequest);

        console.log(`[handleFinalConfirmationStep] Token transfer completed:`, JSON.stringify(transferResult, null, 2));

        // Update session with transfer details
        await offrampSessionService.updateSession(session.id, 'completed', {
          ...session.data,
          transactionHash: transferResult.transactionHash,
          status: 'transfer_completed',
        });

        // Clear the session since the offramp is now completed
        await offrampSessionService.clearSession(session.id);
        console.log(`[handleFinalConfirmationStep] Cleared completed offramp session: ${session.id}`);

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

        // Clear the session so user can start fresh after an error
        await offrampSessionService.clearSession(session.id);
        console.log(`[handleFinalConfirmationStep] Cleared failed offramp session: ${session.id}`);

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
            `Please start a new withdrawal by typing 'offramp' or using the /offramp command.`
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
        "**Supported countries:** Nigeria, Ghana",
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
 * Send templated notification via Telegram
 */
async function sendTelegramNotification(userId: string, template: any): Promise<void> {
  try {
    // Get user's chat ID from database
    const { data: user, error } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[sendTelegramNotification] Error fetching user:', error);
      return;
    }

    if (user && user.telegram_chat_id) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.error('[sendTelegramNotification] No Telegram bot token configured');
        return;
      }

      const payload = {
        chat_id: user.telegram_chat_id,
        text: template.text,
        parse_mode: template.parse_mode || 'Markdown',
        reply_markup: template.reply_markup
      };

      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[sendTelegramNotification] Telegram API error:', errorText);
      } else {
        console.log(`[sendTelegramNotification] Notification sent to user ${userId}`);
      }
    }
  } catch (error) {
    console.error('[sendTelegramNotification] Error sending notification:', error);
  }
}

/**
 * Handle processing status updates with user notifications
 */
async function handleProcessingUpdate(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');

    const statusData = {
      orderId,
      amount: orderData.expectedAmount || orderData.amount || 0,
      currency: orderData.currency || 'USD',
      token: orderData.token || 'USDC',
      network: orderData.network || 'Base',
      transactionHash: orderData.transactionHash,
      transactionReference: orderData.transactionReference,
      recipient: orderData.recipient,
      rate: orderData.rate,
      expectedAmount: orderData.expectedAmount,
      updatedAt: orderData.updatedAt
    };

    const template = OfframpStatusTemplates.getStatusTemplate('processing', statusData);
    await sendTelegramNotification(userId, template);

    console.log(`[handleProcessingUpdate] Sent processing update for order ${orderId}`);
  } catch (error) {
    console.error(`[handleProcessingUpdate] Error sending processing update:`, error);
  }
}

/**
 * Handle on-hold status updates with user notifications
 */
async function handleOnHoldUpdate(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');

    const statusData = {
      orderId,
      amount: orderData.expectedAmount || orderData.amount || 0,
      currency: orderData.currency || 'USD',
      token: orderData.token || 'USDC',
      network: orderData.network || 'Base',
      transactionHash: orderData.transactionHash,
      transactionReference: orderData.transactionReference,
      recipient: orderData.recipient,
      rate: orderData.rate,
      expectedAmount: orderData.expectedAmount,
      updatedAt: orderData.updatedAt
    };

    const template = OfframpStatusTemplates.getStatusTemplate('on_hold', statusData);
    await sendTelegramNotification(userId, template);

    console.log(`[handleOnHoldUpdate] Sent on-hold update for order ${orderId}`);
  } catch (error) {
    console.error(`[handleOnHoldUpdate] Error sending on-hold update:`, error);
  }
}

/**
 * Handle expired withdrawal notifications
 */
async function handleExpiredWithdrawal(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');

    const statusData = {
      orderId,
      amount: orderData.amount || 0,
      currency: orderData.currency || 'USD',
      token: orderData.token || 'USDC',
      network: orderData.network || 'Base',
      transactionHash: orderData.transactionHash,
      transactionReference: orderData.transactionReference,
      recipient: orderData.recipient,
      rate: orderData.rate,
      expectedAmount: orderData.expectedAmount,
      updatedAt: orderData.updatedAt
    };

    const template = OfframpStatusTemplates.getStatusTemplate('expired', statusData);
    await sendTelegramNotification(userId, template);

    console.log(`[handleExpiredWithdrawal] Sent expiration notification for order ${orderId}`);
  } catch (error) {
    console.error(`[handleExpiredWithdrawal] Error sending expiration notification:`, error);
  }
}

/**
 * Handle unknown status updates with user notifications
 */
async function handleUnknownStatusUpdate(userId: string, orderId: string, status: string, orderData: any): Promise<void> {
  try {
    const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');

    const statusData = {
      orderId,
      amount: orderData.expectedAmount || orderData.amount || 0,
      currency: orderData.currency || 'USD',
      token: orderData.token || 'USDC',
      network: orderData.network || 'Base',
      transactionHash: orderData.transactionHash,
      transactionReference: orderData.transactionReference,
      recipient: orderData.recipient,
      rate: orderData.rate,
      expectedAmount: orderData.expectedAmount,
      updatedAt: orderData.updatedAt
    };

    const template = OfframpStatusTemplates.getStatusTemplate(status, statusData);
    await sendTelegramNotification(userId, template);

    console.log(`[handleUnknownStatusUpdate] Sent status update for unknown status ${status} on order ${orderId}`);
  } catch (error) {
    console.error(`[handleUnknownStatusUpdate] Error sending unknown status update:`, error);
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

    // Handle different status states using comprehensive status templates
    const normalizedStatus = status.toLowerCase().trim();

    switch (normalizedStatus) {
      // Success states - stop monitoring
      case 'completed':
      case 'fulfilled':
      case 'success':
      case 'settled':
      case 'delivered':
        await handleSuccessfulWithdrawal(userId, orderId, statusResponse.data);
        return; // Stop monitoring

      // Failure states - stop monitoring
      case 'failed':
      case 'error':
      case 'cancelled':
      case 'rejected':
      case 'declined':
        await handleFailedWithdrawal(userId, orderId, statusResponse.data);
        return; // Stop monitoring

      // Refund states - stop monitoring
      case 'refunded':
      case 'refund_pending':
      case 'refund_processing':
      case 'refund_completed':
        await handleRefundNotification(userId, orderId, statusResponse.data);
        return; // Stop monitoring

      // Expired states - stop monitoring
      case 'expired':
      case 'timeout':
        await handleExpiredWithdrawal(userId, orderId, statusResponse.data);
        return; // Stop monitoring

      // Processing states - continue monitoring
      case 'pending':
      case 'processing':
      case 'awaiting_transfer':
      case 'in_progress':
      case 'submitted':
      case 'confirming':
        await handleProcessingUpdate(userId, orderId, statusResponse.data);
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => {
            monitorOrderStatus(orderId, userId, sessionId, attempt + 1);
          }, RETRY_INTERVAL);
        } else {
          await handleMonitoringTimeout(userId, orderId);
        }
        break;

      // On-hold states - continue monitoring with longer intervals
      case 'on_hold':
      case 'under_review':
      case 'requires_verification':
        await handleOnHoldUpdate(userId, orderId, statusResponse.data);
        if (attempt < MAX_ATTEMPTS) {
          // Use longer interval for review processes
          setTimeout(() => {
            monitorOrderStatus(orderId, userId, sessionId, attempt + 1);
          }, RETRY_INTERVAL * 2); // 60 seconds for review processes
        } else {
          await handleMonitoringTimeout(userId, orderId);
        }
        break;

      // Unknown status - log and continue monitoring
      default:
        console.warn(`[monitorOrderStatus] Unknown status: ${status} for order ${orderId}`);
        await handleUnknownStatusUpdate(userId, orderId, status, statusResponse.data);
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => {
            monitorOrderStatus(orderId, userId, sessionId, attempt + 1);
          }, RETRY_INTERVAL);
        } else {
          await handleMonitoringTimeout(userId, orderId);
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

// Content Creation Handlers
async function handleCreateContent(params: ActionParams, userId: string) {
  try {
    console.log('[handleCreateContent] Starting content creation for user:', userId, 'params:', params);
    
    return {
      text: "📝 **Content Creation Service**\n\n" +
        "I'll help you create a contract for content writing services. This includes:\n\n" +
        "• Blog posts and articles\n" +
        "• Website copy and marketing content\n" +
        "• Social media content\n" +
        "• Technical writing and documentation\n" +
        "• SEO-optimized content\n\n" +
        "💡 **Note**: A 1% platform fee will be deducted from payments.\n\n" +
        "Let me start the contract creation process for your content writing project...",
      action: {
        type: "redirect_to_contract_creation",
        serviceType: "content_writing",
        params: {
          ...params,
          service_category: "content_creation",
          service_type: params.content_type || "content writing"
        }
      }
    };
  } catch (error) {
    console.error('[handleCreateContent] Error:', error);
    return {
      text: "Failed to start content creation service. Please try again later."
    };
  }
}

async function handleCreateDesign(params: ActionParams, userId: string) {
  try {
    console.log('[handleCreateDesign] Starting design service for user:', userId, 'params:', params);
    
    return {
      text: "🎨 **Design Service**\n\n" +
        "I'll help you create a contract for design services. This includes:\n\n" +
        "• Logo and brand design\n" +
        "• Web and UI/UX design\n" +
        "• Graphic design and illustrations\n" +
        "• Marketing materials and visuals\n" +
        "• Brand identity and guidelines\n\n" +
        "💡 **Note**: A 1% platform fee will be deducted from payments.\n\n" +
        "Let me start the contract creation process for your design project...",
      action: {
        type: "redirect_to_contract_creation",
        serviceType: "design",
        params: {
          ...params,
          service_category: "design",
          service_type: params.design_type || "design services"
        }
      }
    };
  } catch (error) {
    console.error('[handleCreateDesign] Error:', error);
    return {
      text: "Failed to start design service. Please try again later."
    };
  }
}

async function handleCreateDevelopment(params: ActionParams, userId: string) {
  try {
    console.log('[handleCreateDevelopment] Starting development service for user:', userId, 'params:', params);
    
    return {
      text: "💻 **Development Service**\n\n" +
        "I'll help you create a contract for development services. This includes:\n\n" +
        "• Web development and websites\n" +
        "• Mobile app development\n" +
        "• Software and API development\n" +
        "• E-commerce platforms\n" +
        "• Custom applications and systems\n\n" +
        "💡 **Note**: A 1% platform fee will be deducted from payments.\n\n" +
        "Let me start the contract creation process for your development project...",
      action: {
        type: "redirect_to_contract_creation",
        serviceType: "development",
        params: {
          ...params,
          service_category: "development",
          service_type: params.project_type || "development services"
        }
      }
    };
  } catch (error) {
    console.error('[handleCreateDevelopment] Error:', error);
    return {
      text: "Failed to start development service. Please try again later."
    };
  }
}

async function handleCreateMarketing(params: ActionParams, userId: string) {
  try {
    console.log('[handleCreateMarketing] Starting marketing service for user:', userId, 'params:', params);
    
    return {
      text: "📈 **Marketing Service**\n\n" +
        "I'll help you create a contract for marketing services. This includes:\n\n" +
        "• SEO and search optimization\n" +
        "• Social media marketing\n" +
        "• Digital advertising campaigns\n" +
        "• Content and email marketing\n" +
        "• Marketing strategy and analytics\n\n" +
        "💡 **Note**: A 1% platform fee will be deducted from payments.\n\n" +
        "Let me start the contract creation process for your marketing project...",
      action: {
        type: "redirect_to_contract_creation",
        serviceType: "marketing",
        params: {
          ...params,
          service_category: "marketing",
          service_type: params.service_type || "marketing services"
        }
      }
    };
  } catch (error) {
    console.error('[handleCreateMarketing] Error:', error);
    return {
      text: "Failed to start marketing service. Please try again later."
    };
  }
}

async function handleCreateConsulting(params: ActionParams, userId: string) {
  try {
    console.log('[handleCreateConsulting] Starting consulting service for user:', userId, 'params:', params);
    
    return {
      text: "🤝 **Consulting Service**\n\n" +
        "I'll help you create a contract for consulting services. This includes:\n\n" +
        "• Business and strategy consulting\n" +
        "• Technical and IT consulting\n" +
        "• Process improvement and optimization\n" +
        "• Digital transformation advisory\n" +
        "• Specialized expertise and guidance\n\n" +
        "💡 **Note**: A 1% platform fee will be deducted from payments.\n\n" +
        "Let me start the contract creation process for your consulting project...",
      action: {
        type: "redirect_to_contract_creation",
        serviceType: "consulting",
        params: {
          ...params,
          service_category: "consulting",
          service_type: params.consulting_type || "consulting services"
        }
      }
    };
  } catch (error) {
    console.error('[handleCreateConsulting] Error:', error);
    return {
      text: "Failed to start consulting service. Please try again later."
    };
  }
}

/**
 * Handle successful withdrawal completion with enhanced templates
 */
async function handleSuccessfulWithdrawal(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');

    const statusData = {
      orderId,
      amount: orderData.expectedAmount || orderData.amount || 0,
      currency: orderData.currency || 'USD',
      token: orderData.token || 'USDC',
      network: orderData.network || 'Base',
      transactionHash: orderData.transactionHash,
      transactionReference: orderData.transactionReference,
      recipient: orderData.recipient,
      rate: orderData.rate,
      expectedAmount: orderData.expectedAmount,
      updatedAt: orderData.updatedAt
    };

    const template = OfframpStatusTemplates.getStatusTemplate('completed', statusData);
    await sendTelegramNotification(userId, template);

    // Update database record
    await supabase
      .from('offramp_transactions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        transaction_hash: orderData.transactionHash || orderData.transactionReference
      })
      .eq('paycrest_order_id', orderId);

    console.log(`[handleSuccessfulWithdrawal] Processed successful withdrawal for order ${orderId}`);
  } catch (error) {
    console.error('[handleSuccessfulWithdrawal] Error:', error);
  }
}

/**
 * Handle failed withdrawal with enhanced templates
 */
async function handleFailedWithdrawal(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');

    const statusData = {
      orderId,
      amount: orderData.expectedAmount || orderData.amount || 0,
      currency: orderData.currency || 'USD',
      token: orderData.token || 'USDC',
      network: orderData.network || 'Base',
      transactionHash: orderData.transactionHash,
      transactionReference: orderData.transactionReference,
      recipient: orderData.recipient,
      rate: orderData.rate,
      expectedAmount: orderData.expectedAmount,
      failureReason: orderData.failureReason || orderData.error || 'Transaction failed',
      updatedAt: orderData.updatedAt
    };

    const template = OfframpStatusTemplates.getStatusTemplate('failed', statusData);
    await sendTelegramNotification(userId, template);

    // Update database record
    await supabase
      .from('offramp_transactions')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_reason: statusData.failureReason
      })
      .eq('paycrest_order_id', orderId);

    console.log(`[handleFailedWithdrawal] Processed failed withdrawal for order ${orderId}`);
  } catch (error) {
    console.error('[handleFailedWithdrawal] Error:', error);
  }
}

/**
 * Handle calendar connection request
 */
async function handleConnectCalendar(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    console.log('[handleConnectCalendar] Called with userId:', userId, 'params:', params);

    // Check if calendar sync is enabled
    const { getCurrentConfig } = await import('../lib/envConfig');
    const config = getCurrentConfig();

    console.log('[handleConnectCalendar] Calendar sync enabled:', config.googleCalendar.enabled);

    if (!config.googleCalendar.enabled) {
      console.log('[handleConnectCalendar] Calendar sync is disabled');
      return {
        text: '📅 **Calendar Sync Unavailable**\n\n' +
          'Calendar sync is currently disabled. Please contact support if you need this feature.'
      };
    }

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
        return {
          text: "❌ User not found. Please make sure you're registered with the bot."
        };
      }

      actualUserId = user.id;
    }

    // Import calendar templates
    const { CalendarErrorTemplates } = await import('../lib/calendarErrorTemplates');

    // Check if user already has calendar connected
    const { googleCalendarService } = await import('../lib/googleCalendarService');
    const isConnected = await googleCalendarService.isConnected(actualUserId);

    if (isConnected) {
      // Test if connection is still working
      const connectionWorking = await googleCalendarService.testConnection(actualUserId);
      if (connectionWorking) {
        // Use success template for already connected
        return {
          text: CalendarErrorTemplates.getSuccessMessage('connect', { userId: actualUserId })
        };
      } else {
        // Use error template for expired connection
        return {
          text: CalendarErrorTemplates.getConnectionErrorMessage({
            userId: actualUserId,
            operation: 'connect',
            errorCode: 401,
            errorMessage: 'invalid_grant'
          })
        };
      }
    }

    // Generate authorization URL
    console.log('[handleConnectCalendar] Generating auth URL for user:', actualUserId);
    const authUrl = googleCalendarService.generateAuthUrl(actualUserId);
    console.log('[handleConnectCalendar] Generated auth URL:', authUrl);

    // Use a template-like message for consistency
    const result = {
      text: '📅 **Connect Your Google Calendar**\n\n' +
        '🎯 **What this does:**\n' +
        '• Automatically adds invoice due dates to your calendar\n' +
        '• Sets up reminders for upcoming payments\n' +
        '• Updates events when invoices are paid\n\n' +
        '🔒 **Privacy:** We only access your calendar to manage invoice-related events.\n\n' +
        'Click the button below to connect your Google Calendar:',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Connect Google Calendar', url: authUrl }],
          [{ text: '❌ Cancel', callback_data: 'calendar_connect_cancel' }]
        ]
      }
    };

    console.log('[handleConnectCalendar] Returning result:', result);
    return result;

  } catch (error) {
    console.error('[handleConnectCalendar] Error:', error);
    // Use error template for connection errors
    const { CalendarErrorTemplates } = await import('../lib/calendarErrorTemplates');
    return {
      text: CalendarErrorTemplates.getConnectionErrorMessage({
        userId,
        operation: 'connect',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * Handle calendar disconnection request
 */
async function handleDisconnectCalendar(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    // Check if calendar sync is enabled
    const { getCurrentConfig } = await import('../lib/envConfig');
    const config = getCurrentConfig();

    if (!config.googleCalendar.enabled) {
      return {
        text: '📅 **Calendar Sync Unavailable**\n\n' +
          'Calendar sync is currently disabled.'
      };
    }

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
        return {
          text: "❌ User not found. Please make sure you're registered with the bot."
        };
      }

      actualUserId = user.id;
    }

    // Import calendar templates
    const { CalendarErrorTemplates } = await import('../lib/calendarErrorTemplates');

    // Check if user has calendar connected
    const { googleCalendarService } = await import('../lib/googleCalendarService');
    const isConnected = await googleCalendarService.isConnected(actualUserId);

    if (!isConnected) {
      return {
        text: '📅 **No Calendar Connected**\n\n' +
          'You don\'t have a Google Calendar connected to your account.\n\n' +
          'Use "connect calendar" to connect your Google Calendar and automatically track invoice due dates.'
      };
    }

    // Show confirmation dialog instead of immediately disconnecting
    return {
      text: '📅 **Disconnect Google Calendar?**\n\n' +
        '⚠️ **This will:**\n' +
        '• Remove access to your Google Calendar\n' +
        '• Stop creating calendar events for new invoices\n' +
        '• Keep existing calendar events (they won\'t be deleted)\n\n' +
        'Are you sure you want to disconnect?',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Yes, Disconnect', callback_data: 'calendar_disconnect_confirm' }],
          [{ text: '❌ Cancel', callback_data: 'calendar_disconnect_cancel' }]
        ]
      }
    };

  } catch (error) {
    console.error('[handleDisconnectCalendar] Error:', error);
    // Use error template for disconnection errors
    const { CalendarErrorTemplates } = await import('../lib/calendarErrorTemplates');
    return {
      text: CalendarErrorTemplates.getConnectionErrorMessage({
        userId,
        operation: 'disconnect',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * Handle calendar status check request
 */
async function handleCalendarStatus(params: ActionParams, userId: string): Promise<ActionResult> {
  try {
    // Check if calendar sync is enabled
    const { getCurrentConfig } = await import('../lib/envConfig');
    const config = getCurrentConfig();

    if (!config.googleCalendar.enabled) {
      return {
        text: '📅 **Calendar Sync Unavailable**\n\n' +
          'Calendar sync is currently disabled in this system.'
      };
    }

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
        return {
          text: "❌ User not found. Please make sure you're registered with the bot."
        };
      }

      actualUserId = user.id;
    }

    // Import calendar templates
    const { CalendarErrorTemplates } = await import('../lib/calendarErrorTemplates');

    // Check connection status
    const { googleCalendarService } = await import('../lib/googleCalendarService');
    const isConnected = await googleCalendarService.isConnected(actualUserId);

    if (!isConnected) {
      return {
        text: '📅 **Calendar Status: Not Connected**\n\n' +
          '❌ You don\'t have a Google Calendar connected.\n\n' +
          '🎯 **Benefits of connecting:**\n' +
          '• Automatic invoice due date tracking\n' +
          '• Payment reminders in your calendar\n' +
          '• Never miss a payment deadline\n\n' +
          'Use "connect calendar" to get started!',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Connect Calendar', callback_data: 'calendar_connect_start' }]
          ]
        }
      };
    }

    // Test if connection is working
    const connectionWorking = await googleCalendarService.testConnection(actualUserId);

    if (connectionWorking) {
      return {
        text: '📅 **Calendar Status: Connected & Working**\n\n' +
          '✅ Your Google Calendar is connected and working properly!\n\n' +
          '🎯 **Active features:**\n' +
          '• Invoice due dates automatically added to calendar\n' +
          '• Payment reminders set up\n' +
          '• Calendar events updated when invoices are paid\n\n' +
          '📊 Your invoices will continue to sync with your calendar.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔌 Disconnect Calendar', callback_data: 'calendar_disconnect_start' }]
          ]
        }
      };
    } else {
      // Use error template for expired connection
      return {
        text: CalendarErrorTemplates.getConnectionErrorMessage({
          userId: actualUserId,
          operation: 'status_check',
          errorCode: 401,
          errorMessage: 'invalid_grant'
        })
      };
    }

  } catch (error) {
    console.error('[handleCalendarStatus] Error:', error);
    // Use error template for status check errors
    const { CalendarErrorTemplates } = await import('../lib/calendarErrorTemplates');
    return {
      text: CalendarErrorTemplates.getConnectionErrorMessage({
        userId,
        operation: 'status_check',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * Handle refund notification with enhanced templates
 */
async function handleRefundNotification(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');

    const statusData = {
      orderId,
      amount: orderData.expectedAmount || orderData.amount || 0,
      currency: orderData.currency || 'USD',
      token: orderData.token || 'USDC',
      network: orderData.network || 'Base',
      transactionHash: orderData.transactionHash,
      transactionReference: orderData.transactionReference,
      recipient: orderData.recipient,
      rate: orderData.rate,
      expectedAmount: orderData.expectedAmount,
      refundReason: orderData.refundReason || orderData.failureReason || 'withdrawal could not be completed',
      updatedAt: orderData.updatedAt
    };

    const template = OfframpStatusTemplates.getStatusTemplate('refunded', statusData);
    await sendTelegramNotification(userId, template);

    // Update database record
    await supabase
      .from('offramp_transactions')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        failure_reason: statusData.refundReason
      })
      .eq('paycrest_order_id', orderId);

    console.log(`[handleRefundNotification] Processed refund notification for order ${orderId}`);
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
