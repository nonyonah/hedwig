import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Paycrest API configuration
const PAYCREST_API_BASE_URL = 'https://api.paycrest.com/v1/sender';

// Supported tokens for offramp
const SUPPORTED_TOKENS = ['USDT', 'USDC'];

// KYC status types
type KYCStatus = 'pending' | 'verified' | 'rejected' | 'not_started';

// Payout status types
type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

// User state during offramp flow
interface OfframpState {
  userId: string;
  chatId: number;
  step: string;
  kycStatus?: KYCStatus;
  kycId?: string;
  amount?: number;
  token?: string;
  bankDetails?: {
    accountNumber?: string;
    bankName?: string;
    country?: string;
  };
  payoutId?: string;
  payoutStatus?: PayoutStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Transaction record
interface OfframpTransaction {
  id: string;
  userId: string;
  amount: number;
  token: string;
  fiatAmount: number;
  fiatCurrency: string;
  bankDetails: {
    accountNumber: string;
    bankName: string;
    country: string;
  };
  status: PayoutStatus;
  payoutId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class OfframpModule {
  private bot: TelegramBot;
  // Ephemeral Paycrest API token for this module's requests
  private apiToken: string | null = null;

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  /**
   * Build Offramp Mini App URL with context
   */
  private buildOfframpUrl(userId: string, chatId: number, chain: string): string {
    const rawBase =
      process.env.WEBAPP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      '';
    let base = rawBase;
    if (base.startsWith('http://')) base = base.replace('http://', 'https://');
    if (base && !base.startsWith('https://')) base = '';
    if (!base) {
      throw new Error('Offramp mini app URL not configured. Set WEBAPP_BASE_URL to an HTTPS domain.');
    }
    const params = new URLSearchParams({ userId, chatId: String(chatId), chain });
    return `${base}/offramp-new?${params.toString()}`;
  }

  /**
   * Start the offramp flow
   */
  async handleOfframpStart(chatId: number, userId: string): Promise<void> {
    try {
      console.log(`[OfframpModule] Starting offramp flow for user ${userId}`);
      
      // Clear any lingering legacy offramp state
      try {
        const { supabase } = await import('../lib/supabase');
        await supabase
          .from('user_states')
          .delete()
          .eq('user_id', userId)
          .eq('state_type', 'offramp');
      } catch (e) {
        console.warn('[OfframpModule] Failed clearing legacy offramp state (non-fatal):', e);
      }

      // Use the new integrated offramp logic from actions.ts
      const { handleOfframp } = await import('../api/actions');
      const result = await handleOfframp({}, userId);
      
      // Send the result message to the user
      await this.bot.sendMessage(chatId, result.text, {
        parse_mode: 'Markdown',
        reply_markup: result.reply_markup ? result.reply_markup : undefined
      });
      
    } catch (error) {
      console.error('[OfframpModule] Error starting offramp flow:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try /offramp again.');
    }
  }

  /**
   * Continue the offramp flow based on current state
   */
  async continueOfframpFlow(chatId: number, userId: string, _messageText: string): Promise<boolean> {
    try {
      // Always redirect to mini app and clear any legacy state
      try {
        const { supabase } = await import('../lib/supabase');
        await supabase
          .from('user_states')
          .delete()
          .eq('user_id', userId)
          .eq('state_type', 'offramp');
      } catch (e) {
        console.warn('[OfframpModule] Failed clearing legacy offramp state during continue (non-fatal):', e);
      }
      const url = this.buildOfframpUrl(userId, chatId, 'Base');
      await this.bot.sendMessage(chatId, '↪️ Redirecting to the Offramp mini app:', {
        reply_markup: { inline_keyboard: [[{ text: 'Open Offramp', web_app: { url } }]] }
      });
      return true;
    } catch (error) {
      console.error('[OfframpModule] Error redirecting during continue:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try /offramp again.');
      return true;
    }
  }

  /**
   * Handle callback queries for offramp flow
   */
  async handleOfframpCallback(callbackQuery: TelegramBot.CallbackQuery, userId?: string): Promise<boolean> {
    const chatId = callbackQuery.message?.chat.id || 0;
    const data = callbackQuery.data || '';

    // Any legacy offramp callbacks should redirect to mini app
    if (data.startsWith('offramp_')) {
      try {
        if (userId) {
          const { supabase } = await import('../lib/supabase');
          await supabase
            .from('user_states')
            .delete()
            .eq('user_id', userId)
            .eq('state_type', 'offramp');
        }
      } catch (e) {
        console.warn('[OfframpModule] Failed clearing legacy state on callback (non-fatal):', e);
      }
      const url = this.buildOfframpUrl(userId || String(chatId), chatId, 'Base');
      await this.bot.sendMessage(chatId, '↪️ Please use the Offramp mini app:', {
        reply_markup: { inline_keyboard: [[{ text: 'Open Offramp', web_app: { url } }]] }
      });
      return true;
    }
    return false;
  }

  /**
   * Initialize the offramp state for a user
   */
  private async initializeOfframpState(chatId: number, userId: string, kycStatus: KYCStatus): Promise<void> {
    const now = new Date();
    
    const state: OfframpState = {
      userId,
      chatId,
      step: kycStatus === 'verified' ? 'collect_amount' : 'kyc_check',
      kycStatus,
      createdAt: now,
      updatedAt: now
    };
    
    // Store state in database
    const { error } = await supabase
      .from('user_states')
      .upsert({
        user_id: userId,
        state_type: 'offramp',
        state_data: state,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });
    
    if (error) {
      console.error('[OfframpModule] Error initializing offramp state:', error);
      throw new Error('Failed to initialize offramp state');
    }
  }

  /**
   * Update the offramp state
   */
  private async updateOfframpState(userId: string, updates: Partial<OfframpState>): Promise<void> {
    try {
      // Get current state
      const { data: currentStateData } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'offramp')
        .single();
      
      if (!currentStateData) {
        throw new Error('No offramp state found');
      }
      
      const currentState = currentStateData.state_data as OfframpState;
      const updatedState = { ...currentState, ...updates, updatedAt: new Date() };
      
      // Update state in database
      const { error } = await supabase
        .from('user_states')
        .update({
          state_data: updatedState,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('state_type', 'offramp');
      
      if (error) {
        console.error('[OfframpModule] Error updating offramp state:', error);
        throw new Error('Failed to update offramp state');
      }
    } catch (error) {
      console.error('[OfframpModule] Error in updateOfframpState:', error);
      throw error;
    }
  }

  /**
   * Get the current offramp state for a user
   */
  private async getOfframpState(userId: string): Promise<OfframpState | null> {
    try {
      const { data, error } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'offramp')
        .single();
      
      if (error || !data) {
        return null;
      }
      
      return data.state_data as OfframpState;
    } catch (error) {
      console.error('[OfframpModule] Error getting offramp state:', error);
      return null;
    }
  }

  /**
   * Clear the offramp state for a user
   */
  private async clearOfframpState(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_states')
        .delete()
        .eq('user_id', userId)
        .eq('state_type', 'offramp');
      
      if (error) {
        console.error('[OfframpModule] Error clearing offramp state:', error);
      }
    } catch (error) {
      console.error('[OfframpModule] Error in clearOfframpState:', error);
    }
  }

  /**
   * Get user's KYC status
   */
  private async getUserKYCStatus(userId: string): Promise<KYCStatus> {
    try {
      // Check if user has KYC record in database
      const { data, error } = await supabase
        .from('user_kyc')
        .select('status, kyc_id')
        .eq('user_id', userId)
        .single();
      
      if (error || !data) {
        return 'not_started';
      }
      
      // If we have a KYC ID, check status with Paycrest
      if (data.kyc_id && data.status !== 'verified') {
        const updatedStatus = await this.checkKYCStatusWithPaycrest(data.kyc_id);
        
        // Update database if status has changed
        if (updatedStatus !== data.status) {
          await supabase
            .from('user_kyc')
            .update({ status: updatedStatus, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          
          return updatedStatus;
        }
        
        return data.status as KYCStatus;
      }
      
      return data.status as KYCStatus;
    } catch (error) {
      console.error('[OfframpModule] Error getting user KYC status:', error);
      return 'not_started';
    }
  }

  /**
   * Initiate KYC process
   */
  private async initiateKYC(chatId: number, userId: string): Promise<void> {
    try {
      if (!this.apiToken) {
        throw new Error('Paycrest API token not configured');
      }
      
      // Get user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, first_name, last_name')
        .eq('id', userId)
        .single();
      
      if (userError || !userData) {
        throw new Error('User data not found');
      }
      
      // Call Paycrest API to initiate KYC
      const response = await axios.post(
        `${PAYCREST_API_BASE_URL}/kyc/initiate`,
        {
          email: userData.email,
          firstName: userData.first_name || 'User',
          lastName: userData.last_name || '',
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/paycrest/kyc-callback`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && response.data.kycId) {
        // Store KYC ID in database
        await supabase
          .from('user_kyc')
          .upsert({
            user_id: userId,
            kyc_id: response.data.kycId,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        // Update offramp state
        await this.updateOfframpState(userId, {
          kycId: response.data.kycId,
          kycStatus: 'pending',
          step: 'kyc_check'
        });
        
        // Send KYC verification link to user
        await this.bot.sendMessage(
          chatId,
          '🔐 *KYC Verification Required*\n\n' +
          'Before you can withdraw funds, you need to complete KYC verification.\n\n' +
          `Please complete your verification using this link:\n${response.data.verificationUrl}\n\n` +
          'Once you have completed the verification, click the button below to check your status.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Check KYC Status', callback_data: 'offramp_check_kyc' }]
              ]
            }
          }
        );
      } else {
        throw new Error('Failed to initiate KYC process');
      }
    } catch (error) {
      console.error('[OfframpModule] Error initiating KYC:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Sorry, there was an error initiating the KYC process. Please try again later.'
      );
    }
  }

  /**
   * Check KYC status with Paycrest API
   */
  private async checkKYCStatusWithPaycrest(kycId: string): Promise<KYCStatus> {
    try {
      if (!this.apiToken) {
        throw new Error('Paycrest API token not configured');
      }
      
      const response = await axios.post(
        `${PAYCREST_API_BASE_URL}/kyc/status`,
        { kycId },
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && response.data.status) {
        // Map Paycrest status to our status
        switch (response.data.status) {
          case 'VERIFIED':
            return 'verified';
          case 'REJECTED':
            return 'rejected';
          default:
            return 'pending';
        }
      }
      
      return 'pending';
    } catch (error) {
      console.error('[OfframpModule] Error checking KYC status with Paycrest:', error);
      return 'pending';
    }
  }

  /**
   * Handle KYC status check
   */
  private async handleKYCStatusCheck(chatId: number, userId: string, state: OfframpState): Promise<boolean> {
    try {
      if (!state.kycId) {
        await this.bot.sendMessage(
          chatId,
          '❌ KYC process has not been initiated. Please start again.'
        );
        await this.clearOfframpState(userId);
        return true;
      }
      
      // Check KYC status with Paycrest
      const kycStatus = await this.checkKYCStatusWithPaycrest(state.kycId);
      
      // Update database
      await supabase
        .from('user_kyc')
        .update({ status: kycStatus, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      
      // Update state
      await this.updateOfframpState(userId, { kycStatus });
      
      if (kycStatus === 'verified') {
        // KYC verified, proceed to amount collection
        await this.bot.sendMessage(
          chatId,
          '✅ *KYC Verification Completed*\n\n' +
          'Your identity has been verified successfully. You can now proceed with the withdrawal.\n\n' +
          'Please enter the amount and token you wish to withdraw:\n' +
          'Example: `10 USDC` or `25 USDT`',
          { parse_mode: 'Markdown' }
        );
        
        await this.updateOfframpState(userId, { step: 'collect_amount' });
      } else if (kycStatus === 'rejected') {
        // KYC rejected
        await this.bot.sendMessage(
          chatId,
          '❌ *KYC Verification Rejected*\n\n' +
          'Unfortunately, your KYC verification was rejected. Please contact support for assistance.',
          { parse_mode: 'Markdown' }
        );
        
        await this.clearOfframpState(userId);
      } else {
        // KYC still pending
        await this.bot.sendMessage(
          chatId,
          '⏳ *KYC Verification Pending*\n\n' +
          'Your KYC verification is still being processed. Please check back later.\n\n' +
          'You can check your status again using the button below.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Check KYC Status', callback_data: 'offramp_check_kyc' }]
              ]
            }
          }
        );
      }
      
      return true;
    } catch (error) {
      console.error('[OfframpModule] Error handling KYC status check:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Sorry, there was an error checking your KYC status. Please try again later.'
      );
      return true;
    }
  }

  /**
   * Handle amount collection
   */
  private async handleAmountCollection(chatId: number, userId: string, messageText: string, state: OfframpState): Promise<boolean> {
    try {
      // Parse amount and token from message
      const match = messageText.match(/^(\d+(\.\d+)?)\s+([A-Za-z]+)$/);
      
      if (!match) {
        await this.bot.sendMessage(
          chatId,
          '❌ Invalid format. Please enter the amount and token in the format:\n' +
          '`10 USDC` or `25 USDT`',
          { parse_mode: 'Markdown' }
        );
        return true;
      }
      
      const amount = parseFloat(match[1]);
      const token = match[3].toUpperCase();
      
      // Validate token
      if (!SUPPORTED_TOKENS.includes(token)) {
        await this.bot.sendMessage(
          chatId,
          `❌ Unsupported token. We currently support: ${SUPPORTED_TOKENS.join(', ')}`,
          { parse_mode: 'Markdown' }
        );
        return true;
      }
      
      // Validate amount
      if (amount <= 0 || isNaN(amount)) {
        await this.bot.sendMessage(
          chatId,
          '❌ Invalid amount. Please enter a positive number.',
          { parse_mode: 'Markdown' }
        );
        return true;
      }
      
      // Update state
      await this.updateOfframpState(userId, {
        amount,
        token,
        step: 'collect_bank_details'
      });
      
      // Proceed to bank details collection
      await this.bot.sendMessage(
        chatId,
        '🏦 *Bank Account Details*\n\n' +
        'Please provide your bank details in the following format:\n\n' +
        '```' +
        'Account Number: 1234567890' +
        'Bank Name: Example Bank' +
        'Country: Nigeria' +
        '```',
        { parse_mode: 'Markdown' }
      );
      
      return true;
    } catch (error) {
      console.error('[OfframpModule] Error handling amount collection:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Sorry, there was an error processing your input. Please try again.'
      );
      return true;
    }
  }

  /**
   * Handle bank details collection
   */
  private async handleBankDetailsCollection(chatId: number, userId: string, messageText: string, state: OfframpState): Promise<boolean> {
    try {
      // Parse bank details from message
      const accountNumberMatch = messageText.match(/Account\s*Number\s*:\s*([\d\s]+)/i);
      const bankNameMatch = messageText.match(/Bank\s*Name\s*:\s*([^\n]+)/i);
      const countryMatch = messageText.match(/Country\s*:\s*([^\n]+)/i);
      
      if (!accountNumberMatch || !bankNameMatch || !countryMatch) {
        await this.bot.sendMessage(
          chatId,
          '❌ Invalid format. Please provide your bank details in the following format:\n\n' +
          '```' +
          'Account Number: 1234567890' +
          'Bank Name: Example Bank' +
          'Country: Nigeria' +
          '```',
          { parse_mode: 'Markdown' }
        );
        return true;
      }
      
      const accountNumber = accountNumberMatch[1].trim();
      const bankName = bankNameMatch[1].trim();
      const country = countryMatch[1].trim();
      
      // Update state
      await this.updateOfframpState(userId, {
        bankDetails: {
          accountNumber,
          bankName,
          country
        },
        step: 'confirm_transaction'
      });
      
      // Calculate fiat amount (mock conversion rate for now)
      const conversionRate = state.token === 'USDC' ? 1.0 : 0.99; // Slightly different rates for different tokens
      const fiatAmount = state.amount! * conversionRate;
      
      // Show confirmation
      await this.bot.sendMessage(
        chatId,
        '💰 *Transaction Summary*\n\n' +
        `Amount: ${state.amount} ${state.token}\n` +
        `Estimated Payout: $${fiatAmount.toFixed(2)} USD\n\n` +
        '*Bank Details:*\n' +
        `Account Number: ${accountNumber}\n` +
        `Bank Name: ${bankName}\n` +
        `Country: ${country}\n\n` +
        '⚠️ Please verify all details before confirming. This transaction cannot be reversed.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Confirm', callback_data: 'offramp_confirm' },
                { text: '❌ Cancel', callback_data: 'offramp_cancel' }
              ]
            ]
          }
        }
      );
      
      return true;
    } catch (error) {
      console.error('[OfframpModule] Error handling bank details collection:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Sorry, there was an error processing your bank details. Please try again.'
      );
      return true;
    }
  }

  /**
   * Handle transaction confirmation
   */
  private async handleTransactionConfirmation(chatId: number, userId: string, messageText: string, state: OfframpState): Promise<boolean> {
    // This is handled by the callback query handler
    return true;
  }

  /**
   * Process offramp transaction
   */
  private async processOfframpTransaction(chatId: number, userId: string): Promise<void> {
    try {
      const state = await this.getOfframpState(userId);
      
      if (!state || !state.amount || !state.token || !state.bankDetails) {
        throw new Error('Incomplete transaction details');
      }
      
      if (!this.apiToken) {
        throw new Error('Paycrest API token not configured');
      }
      
      // Calculate fiat amount (mock conversion rate for now)
      const conversionRate = state.token === 'USDC' ? 1 : 1; // 1:1 for simplicity
      const fiatAmount = state.amount * conversionRate;
      
      // Call Paycrest API to create payout
      const response = await axios.post(
        `${PAYCREST_API_BASE_URL}/payout`,
        {
          amount: fiatAmount,
          currency: 'USD',
          bankDetails: {
            accountNumber: state.bankDetails.accountNumber,
            bankName: state.bankDetails.bankName,
            country: state.bankDetails.country
          },
          reference: `offramp_${userId}_${Date.now()}`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && response.data.payoutId) {
        // Update state
        await this.updateOfframpState(userId, {
          payoutId: response.data.payoutId,
          payoutStatus: 'pending',
          step: 'payout_processing'
        });
        
        // Store transaction in database
        const transaction: OfframpTransaction = {
          id: `offramp_${Date.now()}`,
          userId,
          amount: state.amount,
          token: state.token,
          fiatAmount,
          fiatCurrency: 'USD',
          bankDetails: {
            accountNumber: state.bankDetails.accountNumber!,
            bankName: state.bankDetails.bankName!,
            country: state.bankDetails.country!
          },
          status: 'pending',
          payoutId: response.data.payoutId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await supabase
          .from('offramp_transactions')
          .insert(transaction);
        
        // Send confirmation to user
        await this.bot.sendMessage(
          chatId,
          '✅ *Transaction Initiated*\n\n' +
          `Your withdrawal of ${state.amount} ${state.token} has been initiated.\n\n` +
          `Payout ID: ${response.data.payoutId}\n` +
          `Status: Pending\n\n` +
          'We will notify you once the transaction is completed. This usually takes 1-2 business days.',
          { parse_mode: 'Markdown' }
        );
        
        // Start polling for status updates
        this.pollPayoutStatus(chatId, userId, response.data.payoutId);
      } else {
        throw new Error('Failed to create payout');
      }
    } catch (error) {
      console.error('[OfframpModule] Error processing offramp transaction:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Sorry, there was an error processing your transaction. Please try again later.'
      );
    } finally {
      // Invalidate API token after transaction
      this.invalidateApiToken();
    }
  }

  /**
   * Cancel offramp transaction
   */
  private async cancelOfframpTransaction(chatId: number, userId: string): Promise<void> {
    try {
      await this.clearOfframpState(userId);
      
      await this.bot.sendMessage(
        chatId,
        '❌ Transaction cancelled. Your withdrawal request has been cancelled.',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('[OfframpModule] Error cancelling offramp transaction:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Sorry, there was an error cancelling your transaction.'
      );
    } finally {
      // Invalidate API token after cancellation
      this.invalidateApiToken();
    }
  }

  /**
   * Poll payout status
   */
  private async pollPayoutStatus(chatId: number, userId: string, payoutId: string): Promise<void> {
    try {
      // Initial delay
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get fresh API token for status check
      this.refreshApiToken();
      
      if (!this.apiToken) {
        throw new Error('Paycrest API token not configured');
      }
      
      // Check status with Paycrest
      const response = await axios.get(
        `${PAYCREST_API_BASE_URL}/payout/status/${payoutId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && response.data.status) {
        // Map Paycrest status to our status
        let status: PayoutStatus;
        switch (response.data.status) {
          case 'COMPLETED':
            status = 'completed';
            break;
          case 'FAILED':
            status = 'failed';
            break;
          default:
            status = 'processing';
        }
        
        // Update transaction in database
        await supabase
          .from('offramp_transactions')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('payout_id', payoutId);
        
        if (status === 'completed') {
          // Transaction completed
          await this.bot.sendMessage(
            chatId,
            '🎉 *Transaction Completed*\n\n' +
            `Your withdrawal has been successfully processed and the funds have been sent to your bank account.\n\n` +
            `Payout ID: ${payoutId}\n` +
            'Thank you for using our service!',
            { parse_mode: 'Markdown' }
          );
          
          // Clear state
          await this.clearOfframpState(userId);
        } else if (status === 'failed') {
          // Transaction failed
          await this.bot.sendMessage(
            chatId,
            '❌ *Transaction Failed*\n\n' +
            `Unfortunately, your withdrawal could not be processed. Please contact support for assistance.\n\n` +
            `Payout ID: ${payoutId}`,
            { parse_mode: 'Markdown' }
          );
          
          // Clear state
          await this.clearOfframpState(userId);
        } else {
          // Still processing, continue polling
          setTimeout(() => this.pollPayoutStatus(chatId, userId, payoutId), 60000); // Check again in 1 minute
        }
      } else {
        throw new Error('Failed to get payout status');
      }
    } catch (error) {
      console.error('[OfframpModule] Error polling payout status:', error);
      // Continue polling despite error
      setTimeout(() => this.pollPayoutStatus(chatId, userId, payoutId), 60000); // Try again in 1 minute
    } finally {
      // Invalidate API token after status check
      this.invalidateApiToken();
    }
  }

  /**
   * Refresh API token
   */
  private refreshApiToken(): void {
    // In a real implementation, this would fetch a fresh token from a secure source
    this.apiToken = process.env.PAYCREST_API_TOKEN || null;
  }

  /**
   * Invalidate API token
   */
  private invalidateApiToken(): void {
    // Clear token from memory
    this.apiToken = null;
  }
}