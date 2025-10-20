import * as TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { ethers } from 'ethers';
import { HedwigPaymentService } from '../contracts/HedwigPaymentService';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// USDC Contract addresses
const USDC_CONTRACTS = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base Mainnet
  ethereum: '0xA0b86a33E6441b8C4505E2c8C5C6e8C8C8C8C8C8', // USDC on Ethereum
};

// Solana USDC mint address
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// HedwigPayment contract configuration
const HEDWIG_PAYMENT_CONFIG = {
  contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET || '0xf614B0e35AE0fce9A70b64A11D417DFe83868B27',
  rpcUrl: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
  usdcAddress: USDC_CONTRACTS.base
};

export interface PaymentRequest {
  id: string;
  type: 'invoice' | 'proposal';
  amount: number;
  currency: 'USD' | 'NGN';
  recipient_address?: string;
  network: 'base' | 'solana';
  status: 'pending' | 'completed' | 'failed';
  transaction_hash?: string;
  created_at: string;
}

export class USDCPaymentModule {
  private bot: TelegramBot;
  private exchangeRateCache: { [key: string]: number } = {};
  private cacheExpiry: { [key: string]: number } = {};
  private hedwigPaymentService: HedwigPaymentService;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    
    // Initialize HedwigPayment service
    this.hedwigPaymentService = new HedwigPaymentService(
      HEDWIG_PAYMENT_CONFIG.contractAddress,
      HEDWIG_PAYMENT_CONFIG.rpcUrl
    );
  }

  // Get current NGN to USD exchange rate
  async getExchangeRate(from: string = 'NGN', to: string = 'USD'): Promise<number> {
    const cacheKey = `${from}_${to}`;
    const now = Date.now();
    
    // Check cache (5 minutes expiry)
    if (this.exchangeRateCache[cacheKey] && this.cacheExpiry[cacheKey] > now) {
      return this.exchangeRateCache[cacheKey];
    }

    try {
      // Using a free exchange rate API
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
      const data = await response.json();
      
      const rate = data.rates[to];
      if (rate) {
        this.exchangeRateCache[cacheKey] = rate;
        this.cacheExpiry[cacheKey] = now + (5 * 60 * 1000); // 5 minutes
        return rate;
      }
      
      throw new Error('Rate not found');
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      // Fallback rate (approximate)
      return from === 'NGN' ? 0.0012 : 833.33;
    }
  }

  // Convert NGN to USDC amount
  async convertToUSDC(amount: number, currency: 'USD' | 'NGN'): Promise<number> {
    if (currency === 'USD') {
      return amount; // Already in USD
    }
    
    const rate = await this.getExchangeRate('NGN', 'USD');
    return amount * rate;
  }

  // Calculate fees using smart contract
  async calculateSmartContractFee(amount: number): Promise<{ platformFee: number; freelancerReceives: number }> {
    try {
      const feeInBasisPoints = await this.hedwigPaymentService.getPlatformFee();
      const platformFee = amount * (feeInBasisPoints / 10000);
      return { platformFee, freelancerReceives: amount - platformFee };
    } catch (error) {
      console.error('Error calculating smart contract fee:', error);
      // Fallback to 1% fee
      const platformFee = amount * 0.01;
      return { platformFee, freelancerReceives: amount - platformFee };
    }
  }

  // Generate payment request for invoice/proposal
  async generatePaymentRequest(
    chatId: number,
    itemId: string,
    type: 'invoice' | 'proposal',
    amount: number,
    currency: 'USD' | 'NGN'
  ) {
    try {
      const usdcAmount = await this.convertToUSDC(amount, currency);
      const exchangeRate = currency === 'NGN' ? await this.getExchangeRate('NGN', 'USD') : 1;
      
      const message = (
        `💰 **USDC Payment Options**\n\n` +
        `**${type.charAt(0).toUpperCase() + type.slice(1)} Amount:** ${amount} ${currency}\n` +
        `**USDC Equivalent:** ${usdcAmount.toFixed(2)} USDC\n` +
        (currency === 'NGN' ? `**Exchange Rate:** 1 NGN = ${exchangeRate.toFixed(6)} USD\n\n` : '\n') +
        `Choose your preferred network:`
      );

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔵 Base Network', callback_data: `usdc_base_${itemId}_${type}` }
            ],
            [
              { text: '❌ Cancel', callback_data: `cancel_payment_${itemId}` }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Error generating payment request:', error);
      await this.bot.sendMessage(chatId, '❌ Error generating payment options. Please try again.');
    }
  }

  // Handle USDC payment callback
  async handleUSDCPayment(
    callbackQuery: TelegramBot.CallbackQuery,
    network: 'base' | 'solana',
    itemId: string,
    type: 'invoice' | 'proposal'
  ) {
    const chatId = callbackQuery.message?.chat.id;
    if (!chatId) return;

    try {
      // Get item data (invoice or proposal)
      const { data: item } = await supabase
        .from(type === 'invoice' ? 'invoices' : 'proposals')
        .select('*')
        .eq('id', itemId)
        .single();

      if (!item) {
        await this.bot.sendMessage(chatId, '❌ Item not found.');
        return;
      }

      const usdcAmount = await this.convertToUSDC(item.amount, item.currency);
      
      // Generate payment instructions
      await this.generatePaymentInstructions(chatId, network, usdcAmount, itemId, type, item);
      
    } catch (error) {
      console.error('Error handling USDC payment:', error);
      await this.bot.sendMessage(chatId, '❌ Error processing payment request.');
    }
  }

  // Generate payment instructions for specific network
  private async generatePaymentInstructions(
    chatId: number,
    network: 'base' | 'solana',
    amount: number,
    itemId: string,
    type: 'invoice' | 'proposal',
    item: any
  ) {
    const recipientAddress = await this.getRecipientAddress(network, item.user_id);
    
    if (network === 'base') {
      await this.generateBasePaymentInstructions(chatId, amount, recipientAddress, itemId, type);
    } else {
      await this.generateSolanaPaymentInstructions(chatId, amount, recipientAddress, itemId, type);
    }
  }

  // Generate Base network payment instructions
  private async generateBasePaymentInstructions(
    chatId: number,
    amount: number,
    recipientAddress: string,
    itemId: string,
    type: 'invoice' | 'proposal'
  ) {
    const { platformFee, freelancerReceives } = await this.calculateSmartContractFee(amount);
    
    const message = (
      `🔵 **Base Network USDC Payment**\n\n` +
      `**Payment Amount:** ${amount.toFixed(2)} USDC\n` +
      `**Platform Fee (2%):** ${platformFee.toFixed(2)} USDC\n` +
      `**Freelancer Receives:** ${freelancerReceives.toFixed(2)} USDC\n\n` +
      `**Network:** Base\n` +
      `**Smart Contract:** \`${HEDWIG_PAYMENT_CONFIG.contractAddress}\`\n` +
      `**Recipient Address:**\n\`${recipientAddress}\`\n\n` +
      `**Instructions:**\n` +
      `1. Open your Web3 wallet (MetaMask, Coinbase Wallet, etc.)\n` +
      `2. Switch to Base\n` +
      `3. Use the Hedwig payment interface or send ${amount.toFixed(2)} USDC\n` +
      `4. Payment will be processed through our smart contract\n` +
      `5. Click "Payment Sent" after transaction is confirmed\n\n` +
      `⚠️ **Important:** Only send USDC on Base. Payment is processed via smart contract with automatic fee deduction.`
    );

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Payment Sent', callback_data: `confirm_payment_${itemId}_${type}_base` }
          ],
          [
            { text: '📋 Copy Address', callback_data: `copy_address_${recipientAddress}` },
            { text: '🔗 View on Explorer', callback_data: `explorer_base_${recipientAddress}` }
          ],
          [
            { text: '❌ Cancel', callback_data: `cancel_payment_${itemId}` }
          ]
        ]
      }
    });
  }

  // Generate Solana payment instructions
  private async generateSolanaPaymentInstructions(
    chatId: number,
    amount: number,
    recipientAddress: string,
    itemId: string,
    type: 'invoice' | 'proposal'
  ) {
    const message = (
      `🟣 **Solana USDC Payment**\n\n` +
      `**Amount:** ${amount.toFixed(2)} USDC\n` +
      `**Network:** Solana Mainnet\n` +
      `**Token Mint:** \`${SOLANA_USDC_MINT}\`\n` +
      `**Recipient Address:**\n\`${recipientAddress}\`\n\n` +
      `**Instructions:**\n` +
      `1. Open your Solana wallet (Phantom, Solflare, etc.)\n` +
      `2. Send ${amount.toFixed(2)} USDC to the address above\n` +
      `3. Click "Payment Sent" after transaction is confirmed\n\n` +
      `⚠️ **Important:** Only send USDC on Solana. Other tokens will result in loss of funds.`
    );

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Payment Sent', callback_data: `confirm_payment_${itemId}_${type}_solana` }
          ],
          [
            { text: '📋 Copy Address', callback_data: `copy_address_${recipientAddress}` },
            { text: '🔗 View on Explorer', callback_data: `explorer_solana_${recipientAddress}` }
          ],
          [
            { text: '❌ Cancel', callback_data: `cancel_payment_${itemId}` }
          ]
        ]
      }
    });
  }

  // Handle payment confirmation
  async handlePaymentConfirmation(
    callbackQuery: TelegramBot.CallbackQuery,
    itemId: string,
    type: 'invoice' | 'proposal',
    network: 'base' | 'solana'
  ) {
    const chatId = callbackQuery.message?.chat.id;
    if (!chatId) return;

    try {
      // Create payment record
      const paymentRequest: Partial<PaymentRequest> = {
        id: `${type}_${itemId}_${Date.now()}`,
        type,
        network,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      await supabase
        .from('payment_requests')
        .insert([paymentRequest]);

      const message = (
        `⏳ **Payment Confirmation Pending**\n\n` +
        `We're monitoring the blockchain for your payment.\n` +
        `You'll receive a confirmation once the transaction is detected.\n\n` +
        `**Network:** ${network.charAt(0).toUpperCase() + network.slice(1)}\n` +
        `**Status:** Pending verification\n\n` +
        `This usually takes 1-5 minutes.`
      );

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });

      // Start real blockchain monitoring for Base network payments
      if (network === 'base') {
        await this.startPaymentMonitoring(chatId, itemId, type);
      } else {
        // For Solana, we'll need to implement Solana-specific monitoring
        await this.bot.sendMessage(chatId, '⚠️ Solana payment monitoring not yet implemented. Please check your payment status manually.');
      }

    } catch (error) {
      console.error('Error handling payment confirmation:', error);
      await this.bot.sendMessage(chatId, '❌ Error processing payment confirmation.');
    }
  }

  // Start real blockchain payment monitoring
  private async startPaymentMonitoring(
    chatId: number,
    itemId: string,
    type: 'invoice' | 'proposal'
  ) {
    try {
      // Set up event listener for payments related to this item
      const invoiceIdToMonitor = `${type}_${itemId}`;
      
      // Listen for payment events
      await this.hedwigPaymentService.listenForPayments(async (event) => {
        // Check if this event is for our item
        if (event.invoiceId === invoiceIdToMonitor) {
          await this.handlePaymentReceived(chatId, itemId, type, event);
        }
      });

      console.log(`Started monitoring payments for ${type} ${itemId}`);
    } catch (error) {
      console.error('Error starting payment monitoring:', error);
      await this.bot.sendMessage(chatId, '❌ Error starting payment monitoring.');
    }
  }

  // Handle confirmed payment from blockchain
  private async handlePaymentReceived(
    chatId: number,
    itemId: string,
    type: 'invoice' | 'proposal',
    event: any
  ) {
    try {
      // Update item status
      const updateData = {
        status: type === 'invoice' ? 'paid' : 'accepted',
        payment_method: 'usdc_base',
        transaction_hash: event.transactionHash,
        paid_at: new Date(event.timestamp * 1000).toISOString()
      };

      await supabase
        .from(type === 'invoice' ? 'invoices' : 'proposals')
        .update(updateData)
        .eq('id', itemId);

      const message = (
        `✅ **Payment Confirmed!**\n\n` +
        `Your ${type} payment has been successfully confirmed on the Base network.\n\n` +
        `**Amount:** ${(Number(event.amount) / 1000000).toFixed(2)} USDC\n` +
        `**Fee:** ${(Number(event.fee) / 1000000).toFixed(2)} USDC\n` +
        `**Transaction Hash:**\n\`${event.transactionHash}\`\n\n` +
        `Thank you for your payment!`
      );

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔗 View on BaseScan', url: `https://basescan.org/tx/${event.transactionHash}` }
            ]
          ]
        }
      });

    } catch (error) {
      console.error('Error handling payment received:', error);
    }
  }

  // Get recipient address for user
  private async getRecipientAddress(network: 'base' | 'solana', userId: string): Promise<string> {
    try {
      const { data: user } = await supabase
        .from('users')
        .select(`${network}_address`)
        .eq('id', userId)
        .single();

      if (user && user[`${network}_address` as keyof typeof user]) {
        return user[`${network}_address` as keyof typeof user] as string;
      }

      // Return default address if user hasn't set one
      return network === 'base' 
        ? process.env.DEFAULT_BASE_ADDRESS || '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b9'
        : process.env.DEFAULT_SOLANA_ADDRESS || 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
    } catch (error) {
      console.error('Error getting recipient address:', error);
      // Return default addresses
      return network === 'base' 
        ? '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b9'
        : 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
    }
  }

  // Handle callback queries
  async handleCallback(callbackQuery: TelegramBot.CallbackQuery) {
    const data = callbackQuery.data;
    if (!data) return;

    try {
      if (data.startsWith('usdc_base_')) {
        const parts = data.split('_');
        if (parts.length >= 4) {
          const [, , itemId, type] = parts;
          await this.handleUSDCPayment(callbackQuery, 'base', itemId, type as 'invoice' | 'proposal');
        }
      } else if (data.startsWith('confirm_payment_')) {
        const parts = data.split('_');
        if (parts.length >= 5) {
          const [, , itemId, type, network] = parts;
          await this.handlePaymentConfirmation(callbackQuery, itemId, type as 'invoice' | 'proposal', network as 'base' | 'solana');
        }
      }

      await this.bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Error handling USDC callback:', error);
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred' });
    }
  }
}