import * as TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import { legalContractService, ContractGenerationRequest } from '../services/legalContractService';
import { ProjectContract, ContractMilestone } from '../types/supabase';
import { trackEvent } from '../lib/posthog';
import { sendEmail, generateContractEmailTemplate } from '../lib/emailService';
import { generateContractPDF, ContractPDFData } from './pdf-generator-contracts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Function to get token contract address for a given token type and chain
function getTokenAddress(tokenType: string, chain: string): string {
  const tokenAddresses: Record<string, Record<string, string>> = {
    base: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      ETH: '0x0000000000000000000000000000000000000000'
    },
    ethereum: {
      USDC: '0xA0b86a33E6441b8C4505E2c4B8b5b8e8E8E8E8E8',
      ETH: '0x0000000000000000000000000000000000000000'
    },
    celo: {
      USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a'
    }
  };

  return tokenAddresses[chain]?.[tokenType] || tokenAddresses.base.USDC;
}

interface ContractCreationState {
  step: 'title' | 'description' | 'client_name' | 'client_wallet' | 'client_email' | 'amount' | 'token' | 'chain' | 'deadline' | 'milestones' | 'refund_policy' | 'review' | 'completed';
  data: Partial<ContractGenerationRequest>;
  milestones: Array<{
    title: string;
    description: string;
    amount: number;
    deadline: string;
  }>;
  currentMilestone?: Partial<{
    title: string;
    description: string;
    amount: number;
    deadline: string;
  }>;
  milestoneStep?: 'title' | 'description' | 'amount' | 'deadline';
}

export class ContractModule {
  private bot: TelegramBot;
  private contractStates: Map<string, ContractCreationState> = new Map();

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  /**
   * Start contract creation flow with optional natural language parameters
   */
  async startContractCreation(chatId: number, userId: string, fromConversion?: { type: 'invoice' | 'proposal', id: string }, nlParams?: any) {
    try {
      // Track contract creation start
      trackEvent('contract_creation_started', { chatId, fromConversion: !!fromConversion, hasNlParams: !!nlParams }, userId);

      // Initialize contract state
      const state: ContractCreationState = {
        step: 'title',
        data: {},
        milestones: []
      };

      // If converting from invoice/proposal, pre-fill data
      if (fromConversion) {
        await this.prefillFromExisting(state, fromConversion);
      }

      // If natural language parameters are provided, pre-fill what we can
      if (nlParams) {
        await this.prefillFromNaturalLanguage(state, nlParams, chatId);
      }

      this.contractStates.set(userId, state);
      await this.saveContractState(userId, state);

      // Start with the first unfilled field
      await this.askForNextField(chatId, userId, state, fromConversion);
    } catch (error) {
      console.error('[ContractModule] Error starting contract creation:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to start contract creation. Please try again.');
    }
  }

  /**
   * Handle user input during contract creation with enhanced context awareness
   */
  async handleContractInput(chatId: number, userId: string, message: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state) return false;

    // Validate state integrity
    if (!state.step || !state.data) {
      this.contractStates.delete(userId);
      await this.clearContractStateFromDB(userId);
      return false;
    }

    try {
      // Provide context-aware help for common user confusion
      if (message.toLowerCase().includes('cancel') || message.toLowerCase().includes('stop')) {
        await this.bot.sendMessage(chatId, '❓ **Want to cancel?** Use the ❌ Cancel button below, or type "yes" to confirm cancellation.', {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel Contract Creation', callback_data: 'contract_cancel_contract' },
              { text: '↩️ Continue', callback_data: 'contract_continue' }
            ]]
          }
        });
        return true;
      }

      if (message.toLowerCase().includes('help') || message.toLowerCase().includes('what')) {
        await this.showContextualHelp(chatId, state);
        return true;
      }

      switch (state.step) {
        case 'title':
          return await this.handleTitleInput(chatId, userId, message, state);
        case 'description':
          return await this.handleDescriptionInput(chatId, userId, message, state);
        case 'client_name':
          return await this.handleClientNameInput(chatId, userId, message, state);
        case 'client_wallet':
          return await this.handleClientWalletInput(chatId, userId, message, state);
        case 'client_email':
          return await this.handleClientEmailInput(chatId, userId, message, state);
        case 'amount':
          return await this.handleAmountInput(chatId, userId, message, state);
        case 'deadline':
          return await this.handleDeadlineInput(chatId, userId, message, state);
        case 'milestones':
          return await this.handleMilestonesInput(chatId, userId, message, state);
        case 'refund_policy':
          return await this.handleRefundPolicyInput(chatId, userId, message, state);
        default:
          return false;
      }
    } catch (error) {
      console.error('[ContractModule] Error handling contract input:', error);
      await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again or use the ❌ Cancel button to start over.');
      return true;
    }
  }

  /**
   * Handle callback queries for contract actions
   */
  async handleContractCallback(chatId: number, userId: string, data: string, messageId?: number): Promise<boolean> {
    try {
      if (data.startsWith('contract_')) {
        const action = data.replace('contract_', '');

        switch (action) {
          case 'skip_milestones':
            return await this.skipMilestones(chatId, userId);
          case 'add_milestone':
            return await this.startMilestoneCreation(chatId, userId);
          case 'finish_milestones':
            return await this.finishMilestones(chatId, userId);
          case 'approve_contract':
            return await this.approveContract(chatId, userId);
          case 'edit_contract':
            return await this.editContract(chatId, userId);
          case 'cancel_contract':
            return await this.cancelContract(chatId, userId);
          case 'continue':
            return await this.continueContractFlow(chatId, userId);
          default:
            if (action.startsWith('chain_')) {
              const chain = action.replace('chain_', '');
              return await this.selectChain(chatId, userId, chain);
            }
            if (action.startsWith('token_')) {
              const token = action.replace('token_', '');
              return await this.selectToken(chatId, userId, token);
            }
            if (action.startsWith('resend_email_')) {
              const contractId = action.replace('resend_email_', '');
              return await this.resendContractEmail(chatId, userId, contractId);
            }
            if (action.startsWith('view_contract_')) {
              const contractId = action.replace('view_contract_', '');
              return await this.viewContract(chatId, userId, contractId);
            }
            if (action.startsWith('contract_view_')) {
              const contractId = action.replace('contract_view_', '');
              return await this.viewContract(chatId, userId, contractId);
            }
            if (action.startsWith('send_email_')) {
              const contractId = action.replace('send_email_', '');
              return await this.sendContractEmail(chatId, userId, contractId);
            }
            if (action.startsWith('contract_send_email_')) {
              const contractId = action.replace('contract_send_email_', '');
              return await this.sendContractEmail(chatId, userId, contractId);
            }
            if (action.startsWith('contract_resend_email_')) {
              const contractId = action.replace('contract_resend_email_', '');
              return await this.resendContractEmail(chatId, userId, contractId);
            }
            return false;
        }
      }
      return false;
    } catch (error) {
      console.error('[ContractModule] Error handling contract callback:', error);
      return false;
    }
  }

  /**
   * Prefill contract data from existing invoice or proposal
   */
  private async prefillFromExisting(state: ContractCreationState, fromConversion: { type: 'invoice' | 'proposal', id: string }) {
    try {
      if (fromConversion.type === 'invoice') {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', fromConversion.id)
          .single();

        if (invoice) {
          state.data.projectTitle = `Invoice #${invoice.invoice_number}`;
          state.data.projectDescription = invoice.description || 'Converted from invoice';
          state.data.clientName = invoice.client_name;
          state.data.clientEmail = invoice.client_email;
          state.data.paymentAmount = invoice.amount;
          state.data.tokenType = 'USDC';
          state.data.chain = 'base';
        }
      } else if (fromConversion.type === 'proposal') {
        const { data: proposal } = await supabase
          .from('proposals')
          .select('*')
          .eq('id', fromConversion.id)
          .single();

        if (proposal) {
          state.data.projectTitle = proposal.title;
          state.data.projectDescription = proposal.description;
          state.data.clientName = proposal.client_name;
          state.data.clientEmail = proposal.client_email;
          state.data.paymentAmount = proposal.amount;
          state.data.tokenType = 'USDC';
          state.data.chain = 'base';
        }
      }
    } catch (error) {
      console.error('[ContractModule] Error prefilling from existing:', error);
    }
  }

  /**
   * Ask for project title
   */
  private async askForProjectTitle(chatId: number, fromConversion?: { type: 'invoice' | 'proposal', id: string }) {
    const message = fromConversion
      ? `🔄 **Converting ${fromConversion.type} to Smart Contract**\n\n📝 **Project Title**\n\nPlease enter the project title for your smart contract:`
      : `🆕 **Create New Project Contract**\n\n📝 **Project Title**\n\nPlease enter the title for your project:`;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
        ]]
      }
    });
  }

  /**
   * Handle title input
   */
  private async handleTitleInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    if (message.trim().length < 3) {
      await this.bot.sendMessage(chatId, '❌ Project title must be at least 3 characters long. Please try again:');
      return true;
    }

    state.data.projectTitle = message.trim();
    state.step = 'description';

    // Ensure state is saved
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    await this.bot.sendMessage(chatId,
      `✅ **Project Title:** ${state.data.projectTitle}\n\n📄 **Project Description**\n\nPlease provide a detailed description of the project:`,
      { parse_mode: 'Markdown' }
    );

    return true;
  }

  /**
   * Handle description input
   */
  private async handleDescriptionInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    if (message.trim().length < 10) {
      await this.bot.sendMessage(chatId, '❌ Project description must be at least 10 characters long. Please provide more details:');
      return true;
    }

    state.data.projectDescription = message.trim();
    state.step = 'client_name';

    // Ensure state is saved
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    await this.bot.sendMessage(chatId,
      `✅ **Description saved**\n\n👤 **Client Name**\n\nPlease enter the client's full name:`,
      { parse_mode: 'Markdown' }
    );

    return true;
  }

  /**
   * Handle client name input
   */
  private async handleClientNameInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    if (message.trim().length < 2) {
      await this.bot.sendMessage(chatId, '❌ Client name must be at least 2 characters long. Please try again:');
      return true;
    }

    state.data.clientName = message.trim();
    state.step = 'client_wallet';

    // Ensure state is saved
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    await this.bot.sendMessage(chatId,
      `✅ **Client Name:** ${state.data.clientName}\n\n💳 **Client Wallet Address**\n\nPlease enter the client's wallet address (0x...):`,
      { parse_mode: 'Markdown' }
    );

    return true;
  }

  /**
   * Handle client wallet input
   */
  private async handleClientWalletInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    state.data.clientWallet = message.trim();
    await this.bot.sendMessage(chatId, '✅ Client wallet saved!');

    state.step = 'client_email';
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);
    await this.askForClientEmail(chatId);
    return true;
  }

  /**
   * Handle client email input
   */
  private async handleClientEmailInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    const email = message.trim();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await this.bot.sendMessage(chatId, '❌ Please enter a valid email address (e.g., client@company.com)');
      return true;
    }

    state.data.clientEmail = email;
    await this.bot.sendMessage(chatId, '✅ Client email saved!');

    state.step = 'amount';
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);
    await this.askForPaymentAmount(chatId);
    return true;
  }

  /**
   * Handle amount input
   */
  private async handleAmountInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    const amount = parseFloat(message.trim());

    if (isNaN(amount) || amount <= 0) {
      await this.bot.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number greater than 0:');
      return true;
    }

    state.data.paymentAmount = amount;
    state.step = 'token';
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    await this.bot.sendMessage(chatId,
      `✅ **Amount:** $${amount}\n\n🪙 **Token Type**\n\nSelect the payment token:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💵 USDC', callback_data: 'contract_token_USDC' },
              { text: '🌍 cUSD', callback_data: 'contract_token_cUSD' }
            ]
          ]
        }
      }
    );

    return true;
  }

  /**
   * Handle token selection
   */
  private async selectToken(chatId: number, userId: string, token: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state || state.step !== 'token') return false;

    state.data.tokenType = token;
    state.step = 'chain';
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    await this.bot.sendMessage(chatId,
      `✅ **Token:** ${token}\n\n⛓️ **Network**\n\nSelect the network:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔵 Base', callback_data: 'contract_chain_base' },
              { text: '🟢 Celo', callback_data: 'contract_chain_celo' }
            ]
          ]
        }
      }
    );

    return true;
  }

  /**
   * Handle chain selection
   */
  private async selectChain(chatId: number, userId: string, chain: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state || state.step !== 'chain') return false;

    state.data.chain = chain as 'base' | 'celo' | 'polygon';
    state.step = 'deadline';
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    await this.bot.sendMessage(chatId,
      `✅ **Network:** ${chain.toUpperCase()}\n\n📅 **Project Deadline**\n\nPlease enter the project deadline (YYYY-MM-DD format):`,
      { parse_mode: 'Markdown' }
    );

    return true;
  }

  /**
   * Handle deadline input
   */
  private async handleDeadlineInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(message.trim())) {
      await this.bot.sendMessage(chatId, '❌ Invalid date format. Please use YYYY-MM-DD format (e.g., 2024-12-31):');
      return true;
    }

    const deadline = new Date(message.trim());
    const now = new Date();

    if (deadline <= now) {
      await this.bot.sendMessage(chatId, '❌ Deadline must be in the future. Please enter a valid future date:');
      return true;
    }

    state.data.deadline = deadline.toISOString();
    state.step = 'milestones';
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    await this.bot.sendMessage(chatId,
      `✅ **Deadline:** ${deadline.toLocaleDateString()}\n\n🎯 **Milestones (Optional)**\n\nWould you like to add project milestones?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Add Milestones', callback_data: 'contract_add_milestone' },
              { text: '⏭️ Skip Milestones', callback_data: 'contract_skip_milestones' }
            ]
          ]
        }
      }
    );

    return true;
  }

  /**
   * Skip milestones and proceed to refund policy
   */
  private async skipMilestones(chatId: number, userId: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state) return false;

    state.step = 'refund_policy';
    await this.askForRefundPolicy(chatId);
    return true;
  }

  /**
   * Start milestone creation
   */
  private async startMilestoneCreation(chatId: number, userId: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state) return false;

    state.currentMilestone = {};
    state.milestoneStep = 'title';

    await this.bot.sendMessage(chatId,
      `🎯 **Milestone ${state.milestones.length + 1}**\n\n📝 **Milestone Title**\n\nEnter the title for this milestone:`,
      { parse_mode: 'Markdown' }
    );

    return true;
  }

  /**
   * Handle milestones input
   */
  private async handleMilestonesInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    // If milestone state is corrupted, reinitialize milestone creation
    if (!state.currentMilestone || !state.milestoneStep) {
      console.log('[ContractModule] Milestone state corrupted, reinitializing...');
      state.currentMilestone = {};
      state.milestoneStep = 'title';
      await this.bot.sendMessage(chatId,
        `🎯 **Milestone ${state.milestones.length + 1}**\n\n📝 **Milestone Title**\n\nEnter the title for this milestone:`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    switch (state.milestoneStep) {
      case 'title':
        state.currentMilestone.title = message.trim();
        state.milestoneStep = 'description';
        await this.bot.sendMessage(chatId, '📄 **Milestone Description**\n\nEnter the description for this milestone:');
        break;

      case 'description':
        state.currentMilestone.description = message.trim();
        state.milestoneStep = 'amount';
        await this.bot.sendMessage(chatId, '💰 **Milestone Amount**\n\nEnter the payment amount for this milestone:');
        break;

      case 'amount':
        const amount = parseFloat(message.trim());
        if (isNaN(amount) || amount <= 0) {
          await this.bot.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number:');
          return true;
        }
        state.currentMilestone.amount = amount;
        state.milestoneStep = 'deadline';
        await this.bot.sendMessage(chatId, '📅 **Milestone Deadline**\n\nEnter the deadline for this milestone (YYYY-MM-DD):');
        break;

      case 'deadline':
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(message.trim())) {
          await this.bot.sendMessage(chatId, '❌ Invalid date format. Please use YYYY-MM-DD format:');
          return true;
        }

        const deadline = new Date(message.trim());
        if (deadline <= new Date()) {
          await this.bot.sendMessage(chatId, '❌ Deadline must be in the future. Please enter a valid date:');
          return true;
        }

        state.currentMilestone.deadline = deadline.toISOString();

        // Add completed milestone to list
        state.milestones.push(state.currentMilestone as any);
        state.currentMilestone = undefined;
        state.milestoneStep = undefined;

        await this.bot.sendMessage(chatId,
          `✅ **Milestone ${state.milestones.length} Added**\n\nWould you like to add another milestone?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '➕ Add Another', callback_data: 'contract_add_milestone' },
                  { text: '✅ Finish Milestones', callback_data: 'contract_finish_milestones' }
                ]
              ]
            }
          }
        );
        break;
    }

    return true;
  }

  /**
   * Finish milestones and proceed to refund policy
   */
  private async finishMilestones(chatId: number, userId: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state) return false;

    state.step = 'refund_policy';
    await this.askForRefundPolicy(chatId);
    return true;
  }

  /**
   * Ask for project description
   */
  private async askForProjectDescription(chatId: number) {
    await this.bot.sendMessage(chatId,
      `📝 **Project Description**\n\nPlease provide a detailed description of your project:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
          ]]
        }
      }
    );
  }

  /**
   * Ask for client name
   */
  private async askForClientName(chatId: number) {
    const message = `👤 **Client Name**

Please enter your client's full name:

*Example: John Smith or ABC Company Inc.*

💡 This name will appear on the contract and all related documents.`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  /**
   * Ask for client wallet address
   */
  private async askForClientWallet(chatId: number) {
    const message = `💳 **Client Wallet Address**

Please enter your client's cryptocurrency wallet address where they will receive payments:

*Example: 0x1234567890abcdef1234567890abcdef12345678*

💡 This should be a valid wallet address on the blockchain you'll select later.`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  /**
   * Ask for client email address
   */
  private async askForClientEmail(chatId: number) {
    const message = `📧 **Client Email Address**

Please enter your client's email address for contract notifications and signing:

*Example: client@company.com*

💡 The client will receive contract updates and signing instructions at this email.`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  /**
   * Ask for payment amount
   */
  private async askForPaymentAmount(chatId: number) {
    await this.bot.sendMessage(chatId,
      `💵 **Payment Amount**\n\nPlease enter the total payment amount (numbers only):`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
          ]]
        }
      }
    );
  }

  /**
   * Ask for token selection
   */
  private async askForToken(chatId: number) {
    await this.bot.sendMessage(chatId,
      `🪙 **Select Token**\n\nChoose the token for payment:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'USDC', callback_data: 'contract_token_USDC' },
              { text: 'cUSD', callback_data: 'contract_token_cUSD' }
            ],
            [
              { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
            ]
          ]
        }
      }
    );
  }

  /**
   * Ask for blockchain selection
   */
  private async askForChain(chatId: number) {
    await this.bot.sendMessage(chatId,
      `⛓️ **Select Network**\n\nChoose the network for your contract:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔵 Base', callback_data: 'contract_chain_base' },
              { text: '🟢 Celo', callback_data: 'contract_chain_celo' }
            ],
            [
              { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
            ]
          ]
        }
      }
    );
  }

  /**
   * Ask for deadline
   */
  private async askForDeadline(chatId: number) {
    await this.bot.sendMessage(chatId,
      `📅 **Project Deadline**\n\nPlease enter the project deadline (e.g., "2024-12-31", "in 30 days", "next month"):`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
          ]]
        }
      }
    );
  }

  /**
   * Ask for milestones
   */
  private async askForMilestones(chatId: number) {
    await this.bot.sendMessage(chatId,
      `🎯 **Project Milestones**\n\nWould you like to add milestones to break down the project into smaller deliverables?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Add Milestones', callback_data: 'contract_add_milestone' },
              { text: '⏭️ Skip Milestones', callback_data: 'contract_skip_milestones' }
            ],
            [
              { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
            ]
          ]
        }
      }
    );
  }

  /**
   * Ask for refund policy
   */
  private async askForRefundPolicy(chatId: number) {
    await this.bot.sendMessage(chatId,
      `🔄 **Refund Policy (Optional)**\n\nEnter custom refund terms, or type "skip" to use default policy:`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle refund policy input
   */
  private async handleRefundPolicyInput(chatId: number, userId: string, message: string, state: ContractCreationState): Promise<boolean> {
    if (message.trim().toLowerCase() !== 'skip') {
      state.data.refundPolicy = message.trim();
    }

    state.step = 'review';
    await this.showContractReview(chatId, userId, state);
    return true;
  }

  /**
   * Show contract review
   */
  private async showContractReview(chatId: number, userId: string, state: ContractCreationState) {
    const { data, milestones } = state;

    let message = `📋 **Contract Review**\n\n`;
    message += `📝 **Title:** ${data.projectTitle}\n`;
    message += `📄 **Description:** ${data.projectDescription}\n`;
    message += `👤 **Client:** ${data.clientName}\n`;
    message += `📧 **Client Email:** ${data.clientEmail}\n`;
    message += `💳 **Client Wallet:** ${data.clientWallet}\n`;
    message += `💰 **Amount:** ${data.paymentAmount} ${data.tokenType}\n`;
    message += `⛓️ **Network:** ${data.chain?.toUpperCase()}\n`;
    message += `📅 **Deadline:** ${new Date(data.deadline!).toLocaleDateString()}\n`;

    if (milestones.length > 0) {
      message += `\n🎯 **Milestones:**\n`;
      milestones.forEach((milestone, index) => {
        message += `${index + 1}. ${milestone.title} - ${milestone.amount} ${data.tokenType}\n`;
      });
    }

    if (data.refundPolicy) {
      message += `\n🔄 **Refund Policy:** ${data.refundPolicy}\n`;
    }

    message += `\n⚡ **Next Steps:**\n1. I'll generate a legal contract \n2. Deploy smart contract for it\n3. Share with client for approval`;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Generate Contract', callback_data: 'contract_approve_contract' },
            { text: '✏️ Edit Details', callback_data: 'contract_edit_contract' }
          ],
          [
            { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
          ]
        ]
      }
    });
  }

  /**
   * Approve and generate contract
   */
  private async approveContract(chatId: number, userId: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state) {
      return false;
    }

    try {
      await this.bot.sendMessage(chatId, '🤖 **Generating Legal Contract...**\n\nPlease wait while I draft a contract for you.', {
        parse_mode: 'Markdown'
      });

      // Get freelancer info
      const { data: user } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .single();

      // Get freelancer's wallet address
      const { data: wallets } = await supabase
        .from('wallets')
        .select('address, chain')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      // Find the best wallet address (prefer EVM/Base, fallback to any wallet)
      let freelancerWallet = '';
      if (wallets && wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
        freelancerWallet = evmWallet?.address || wallets[0]?.address || '';
      }

      // Generate legal contract using the service
      const contractRequest: ContractGenerationRequest = {
        freelancerName: user?.name || 'Freelancer',
        freelancerEmail: user?.email || '',
        freelancerWallet: freelancerWallet,
        clientName: state.data.clientName || 'Client',
        clientEmail: state.data.clientEmail || '',
        clientWallet: state.data.clientWallet || '',
        projectTitle: state.data.projectTitle || '',
        projectDescription: state.data.projectDescription || '',
        paymentAmount: state.data.paymentAmount || 0,
        tokenType: state.data.tokenType || 'USDC',
        chain: state.data.chain || 'base',
        deadline: state.data.deadline || '',
        milestones: state.milestones || [],
        refundPolicy: state.data.refundPolicy || ''
      };

      const result = await legalContractService.generateContract(contractRequest);

      if (!result.success || !result.contractId) {
        await this.bot.sendMessage(chatId, `❌ Failed to generate contract: ${result.error || 'No contract ID returned'}`);
        return true;
      }

      // Create project contract entry
      const tokenAddress = getTokenAddress(contractRequest.tokenType, contractRequest.chain);
      console.log('[ContractModule] Creating project contract with freelancer_id:', userId);
      
      const { data: projectContract, error: projectContractError } = await supabase
        .from('project_contracts')
        .insert({
          freelancer_id: userId,
          client_email: contractRequest.clientEmail,
          project_title: contractRequest.projectTitle,
          project_description: contractRequest.projectDescription,
          total_amount: contractRequest.paymentAmount,
          currency: contractRequest.tokenType,
          token_type: contractRequest.tokenType,
          chain: contractRequest.chain,
          token_address: tokenAddress,
          deadline: contractRequest.deadline,
          legal_contract_id: result.contractId,
          legal_contract_hash: result.contractHash || '',
          status: 'created'
        })
        .select()
        .single();

      if (projectContractError || !projectContract || !projectContract.id) {
        console.error('[ContractModule] Error creating project contract:', projectContractError);
        await this.bot.sendMessage(chatId, `❌ Failed to create project contract: ${projectContractError?.message || 'Unknown error'}`);
        return true;
      }

      const projectContractId = projectContract.id;

      // Create milestones for the project contract
      if (contractRequest.milestones && contractRequest.milestones.length > 0) {
        const milestoneInserts = contractRequest.milestones.map((milestone, index) => ({
          contract_id: projectContractId,
          milestone_id: index + 1,
          title: milestone.title,
          description: milestone.description,
          amount: milestone.amount,
          deadline: milestone.deadline,
          due_date: milestone.deadline,
          status: 'pending'
        }));

        const { error: milestonesError } = await supabase
          .from('contract_milestones')
          .insert(milestoneInserts);

        if (milestonesError) {
          console.error('[ContractModule] Error creating milestones:', milestonesError);
          // Don't fail the whole process, just log the error
        }
      }

      // Clear the contract state
      this.contractStates.delete(userId);
      await this.clearContractStateFromDB(userId);

      // Track the event
      await trackEvent('contract_created', {
        project_title: contractRequest.projectTitle,
        total_amount: contractRequest.paymentAmount,
        token_type: contractRequest.tokenType,
        chain: contractRequest.chain,
        milestones_count: contractRequest.milestones.length
      }, userId);

      // Automatically send email to client
      try {
        await this.sendContractEmailInternal(projectContractId, contractRequest.clientEmail || '');
        
        await this.bot.sendMessage(chatId,
          `✅ **Contract Generated Successfully!**\n\n📄 Contract ID: \`${projectContract.id}\`\n📧 Email automatically sent to: ${contractRequest.clientEmail}\n\nThe client will receive an email with the contract details and approval link.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📄 View Contract PDF', callback_data: `view_contract_${projectContract.id}` }
                ],
                [
                  { text: '📋 List All Contracts', callback_data: 'business_contracts' },
                  { text: '🔄 Resend Email', callback_data: `contract_resend_email_${projectContract.id}` }
                ]
              ]
            }
          }
        );
      } catch (emailError) {
        console.error('[ContractModule] Error sending automatic email:', emailError);
        
        await this.bot.sendMessage(chatId,
          `✅ **Contract Generated Successfully!**\n\n📄 Contract ID: \`${projectContract.id}\`\n⚠️ Email sending failed - please send manually\n\nUse the button below to send the contract to your client.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📄 View Contract PDF', callback_data: `view_contract_${projectContract.id}` },
                  { text: '📧 Send to Client', callback_data: `contract_send_email_${projectContract.id}` }
                ],
                [
                  { text: '📋 List All Contracts', callback_data: 'business_contracts' }
                ]
              ]
            }
          }
        );
      }

      return true;
    } catch (error) {
      console.error('[ContractModule] Error generating contract:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to generate contract. Please try again.');
      return true;
    }
  }

  /**
   * Edit contract details
   */
  private async editContract(chatId: number, userId: string): Promise<boolean> {
    await this.bot.sendMessage(chatId, '✏️ **Edit Contract**\n\nWhich detail would you like to edit?', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📝 Title', callback_data: 'contract_edit_title' },
            { text: '📄 Description', callback_data: 'contract_edit_description' }
          ],
          [
            { text: '💰 Amount', callback_data: 'contract_edit_amount' },
            { text: '📅 Deadline', callback_data: 'contract_edit_deadline' }
          ],
          [
            { text: '🔙 Back to Review', callback_data: 'contract_back_to_review' }
          ]
        ]
      }
    });
    return true;
  }

  /**
   * Cancel contract creation
   */
  private async cancelContract(chatId: number, userId: string): Promise<boolean> {
    this.contractStates.delete(userId);
    await this.clearContractStateFromDB(userId);
    await this.bot.sendMessage(chatId, '❌ **Contract creation cancelled.**\n\nYou can start a new contract anytime with /contract command.');
    return true;
  }

  /**
   * List user's contracts
   */
  async listContracts(chatId: number, userId: string) {
    try {
      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select('*')
        .eq('freelancer_id', userId)
        .order('created_at', { ascending: false })
        .limit(10) as { data: ProjectContract[] | null, error: any };

      if (error) throw error;

      if (!contracts || contracts.length === 0) {
        await this.bot.sendMessage(chatId,
          '📄 **No Contracts Found**\n\nYou haven\'t created any project contracts yet.\n\nUse /contract to create your first smart contract!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📋 **Your Project Contracts**\n\n';
      const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

      contracts.forEach((contract, index) => {
        const statusEmoji = this.getContractStatusEmoji(contract.status);
        const amount = `${contract.total_amount} ${contract.token_address}`;

        message += `${statusEmoji} **${contract.project_title}**\n`;
        message += `   💰 ${amount} on ${contract.chain.toUpperCase()}\n`;
        message += `   📅 Deadline: ${new Date(contract.deadline).toLocaleDateString()}\n`;
        message += `   🔗 ID: ${contract.id.substring(0, 12)}...\n\n`;

        keyboard.push([
          { text: `View ${contract.project_title}`, callback_data: `view_contract_${contract.id}` }
        ]);
      });

      keyboard.push([
        { text: '➕ Create New Contract', callback_data: 'create_new_contract' }
      ]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error('[ContractModule] Error listing contracts:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to load contracts. Please try again.');
    }
  }

  /**
   * Handle contract creation flow - delegates to existing startContractCreation
   */
  async handleContractCreation(chatId: number, userId: string) {
    await this.startContractCreation(chatId, userId);
  }

  /**
   * Continue contract creation based on current state - delegates to existing handleContractInput
   */
  async continueContractCreation(chatId: number, userId: string, contractState: any, input: string) {
    // Convert database state to memory state format
    const state = this.contractStates.get(userId);
    if (!state) {
      // Restore state from database format
      this.contractStates.set(userId, {
        step: contractState.step || 'title',
        data: contractState.data || {},
        milestones: contractState.milestones || []
      });
    }

    return await this.handleContractInput(chatId, userId, input);
  }

  /**
   * Handle callback queries for contract actions - delegates to existing handleContractCallback
   */
  async handleCallback(callbackQuery: TelegramBot.CallbackQuery, userId: string) {
    const chatId = callbackQuery.message?.chat.id;
    if (!chatId || !callbackQuery.data?.startsWith('contract_')) return;

    return await this.handleContractCallback(chatId, userId, callbackQuery.data, callbackQuery.message?.message_id);
  }

  /**
   * Get contract status emoji
   */
  private getContractStatusEmoji(status: string): string {
    switch (status) {
      case 'draft': return '📝';
      case 'pending_approval': return '⏳';
      case 'active': return '✅';
      case 'completed': return '🎉';
      case 'disputed': return '⚠️';
      case 'cancelled': return '❌';
      default: return '📄';
    }
  }

  /**
   * Check if user is in contract creation flow
   */
  async isInContractFlow(userId: string): Promise<boolean> {
    // First check memory cache
    if (this.contractStates.has(userId)) {
      return true;
    }

    // Check database for persistent state
    try {
      const { data } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'contract_creation')
        .single();

      if (data?.state_data) {
        // Restore state to memory cache
        this.contractStates.set(userId, data.state_data);
        return true;
      }
    } catch (error) {
      console.error('[ContractModule] Error checking contract flow state:', error);
    }

    return false;
  }

  /**
   * Save contract creation state to database
   */
  private async saveContractState(userId: string, state: ContractCreationState): Promise<void> {
    try {
      await supabase
        .from('user_states')
        .upsert({
          user_id: userId,
          state_type: 'contract_creation',
          state_data: state,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,state_type'
        });
    } catch (error) {
      console.error('[ContractModule] Error saving contract state:', error);
    }
  }



  /**
   * Pre-fill contract data from natural language parameters
   */
  private async prefillFromNaturalLanguage(state: ContractCreationState, params: any, chatId: number) {
    try {
      // Map natural language parameters to contract data
      if (params.service_description || params.project_description) {
        state.data.projectDescription = params.service_description || params.project_description;
      }

      if (params.client_name) {
        state.data.clientName = params.client_name;
      }

      if (params.payment_amount) {
        const amount = parseFloat(params.payment_amount);
        if (!isNaN(amount)) {
          state.data.paymentAmount = amount;
        }
      }

      if (params.currency) {
        // Map common currency names to tokens
        const currencyMap: { [key: string]: string } = {
          'USD': 'USDC',
          'USDC': 'USDC',
          'USDT': 'USDT',
          'ETH': 'ETH'
        };
        state.data.tokenType = currencyMap[params.currency.toUpperCase()] || 'USDC';
      }

      if (params.timeline || params.deadline) {
        // Try to parse timeline into a deadline
        const timelineText = params.timeline || params.deadline;
        const deadline = this.parseTimelineToDeadline(timelineText);
        if (deadline) {
          state.data.deadline = deadline;
        }
      }

      // Set default chain
      state.data.chain = 'base';

      // If we have enough info, show a summary
      if (state.data.projectDescription || state.data.clientName || state.data.paymentAmount) {
        await this.showNaturalLanguageSummary(chatId, state, params);
      }
    } catch (error) {
      console.error('[ContractModule] Error prefilling from natural language:', error);
    }
  }

  /**
   * Show summary of extracted natural language parameters
   */
  private async showNaturalLanguageSummary(chatId: number, state: ContractCreationState, params: any) {
    let summary = '🤖 **I understood the following from your request:**\n\n';

    if (state.data.projectDescription) {
      summary += `📝 **Service:** ${state.data.projectDescription}\n`;
    }
    if (state.data.clientName) {
      summary += `👤 **Client:** ${state.data.clientName}\n`;
    }
    if (state.data.paymentAmount) {
      summary += `💰 **Amount:** ${state.data.paymentAmount} ${state.data.tokenType || 'USDC'}\n`;
    }
    if (state.data.deadline) {
      summary += `⏰ **Deadline:** ${state.data.deadline}\n`;
    }

    summary += '\n📋 **Let\'s complete the remaining details...**';

    await this.bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
  }

  /**
   * Parse timeline text into a deadline date
   */
  private parseTimelineToDeadline(timeline: string): string | null {
    try {
      const now = new Date();
      const timelineText = timeline.toLowerCase();

      // Handle common patterns
      if (timelineText.includes('week')) {
        const weeks = parseInt(timelineText.match(/(\d+)/)?.[1] || '1');
        const deadline = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
        return deadline.toISOString().split('T')[0];
      }

      if (timelineText.includes('month')) {
        const months = parseInt(timelineText.match(/(\d+)/)?.[1] || '1');
        const deadline = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
        return deadline.toISOString().split('T')[0];
      }

      if (timelineText.includes('day')) {
        const days = parseInt(timelineText.match(/(\d+)/)?.[1] || '7');
        const deadline = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        return deadline.toISOString().split('T')[0];
      }

      return null;
    } catch (error) {
      console.error('[ContractModule] Error parsing timeline:', error);
      return null;
    }
  }

  /**
   * Ask for the next required field in the contract creation flow
   */
  private async askForNextField(chatId: number, userId: string, state: ContractCreationState, fromConversion?: { type: 'invoice' | 'proposal', id: string }) {
    // Ensure state is properly saved after any updates
    this.contractStates.set(userId, state);
    await this.saveContractState(userId, state);

    // If we have a current step, continue from there, otherwise determine based on what's missing
    switch (state.step) {
      case 'title':
        if (!state.data.projectTitle) {
          await this.askForProjectTitle(chatId, fromConversion);
        } else {
          state.step = 'description';
          await this.askForProjectDescription(chatId);
        }
        break;
      case 'description':
        if (!state.data.projectDescription) {
          await this.askForProjectDescription(chatId);
        } else {
          state.step = 'client_name';
          await this.askForClientName(chatId);
        }
        break;
      case 'client_name':
        if (!state.data.clientName) {
          await this.askForClientName(chatId);
        } else {
          state.step = 'client_wallet';
          await this.askForClientWallet(chatId);
        }
        break;
      case 'client_wallet':
        if (!state.data.clientWallet) {
          await this.askForClientWallet(chatId);
        } else {
          state.step = 'client_email';
          await this.askForClientEmail(chatId);
        }
        break;
      case 'client_email':
        if (!state.data.clientEmail) {
          await this.askForClientEmail(chatId);
        } else {
          state.step = 'amount';
          await this.askForPaymentAmount(chatId);
        }
        break;
      case 'amount':
        if (!state.data.paymentAmount) {
          await this.askForPaymentAmount(chatId);
        } else {
          state.step = 'token';
          await this.askForToken(chatId);
        }
        break;
      case 'token':
        if (!state.data.tokenType) {
          await this.askForToken(chatId);
        } else {
          state.step = 'chain';
          await this.askForChain(chatId);
        }
        break;
      case 'chain':
        if (!state.data.chain) {
          await this.askForChain(chatId);
        } else {
          state.step = 'deadline';
          await this.askForDeadline(chatId);
        }
        break;
      case 'deadline':
        if (!state.data.deadline) {
          await this.askForDeadline(chatId);
        } else {
          state.step = 'milestones';
          await this.askForMilestones(chatId);
        }
        break;
      case 'milestones':
        await this.askForMilestones(chatId);
        break;
      case 'refund_policy':
        await this.askForRefundPolicy(chatId);
        break;
      default:
        // Fallback to the original logic for initial setup
        if (!state.data.projectTitle) {
          state.step = 'title';
          await this.askForProjectTitle(chatId, fromConversion);
        } else if (!state.data.projectDescription) {
          state.step = 'description';
          await this.askForProjectDescription(chatId);
        } else if (!state.data.clientName) {
          state.step = 'client_name';
          await this.askForClientName(chatId);
        } else if (!state.data.clientWallet) {
          state.step = 'client_wallet';
          await this.askForClientWallet(chatId);
        } else if (!state.data.clientEmail) {
          state.step = 'client_email';
          await this.askForClientEmail(chatId);
        } else if (!state.data.paymentAmount) {
          state.step = 'amount';
          await this.askForPaymentAmount(chatId);
        } else if (!state.data.tokenType) {
          state.step = 'token';
          await this.askForToken(chatId);
        } else if (!state.data.chain) {
          state.step = 'chain';
          await this.askForChain(chatId);
        } else if (!state.data.deadline) {
          state.step = 'deadline';
          await this.askForDeadline(chatId);
        } else {
          state.step = 'milestones';
          await this.askForMilestones(chatId);
        }
        break;
    }
  }

  /**
   * Show contextual help based on current step
   */
  private async showContextualHelp(chatId: number, state: ContractCreationState) {
    let helpText = '💡 **Help for current step:**\n\n';

    switch (state.step) {
      case 'title':
        helpText += '📝 **Project Title**: Enter a clear, descriptive title for your project.\n\nExample: "Website Development for E-commerce Store"';
        break;
      case 'description':
        helpText += '📋 **Project Description**: Provide details about what work will be done.\n\nExample: "Design and develop a responsive e-commerce website with payment integration"';
        break;
      case 'client_name':
        helpText += '👤 **Client Name**: Enter the client\'s full name or company name.\n\nExample: "John Smith" or "ABC Company Inc."';
        break;
      case 'client_wallet':
        helpText += '💳 **Client Wallet**: Enter the client\'s cryptocurrency wallet address.\n\nExample: 0x1234...abcd (Ethereum/Base address)';
        break;
      case 'client_email':
        helpText += '📧 **Client Email**: Enter the client\'s email address for contract notifications.\n\nExample: client@company.com';
        break;
      case 'amount':
        helpText += '💰 **Payment Amount**: Enter the total payment amount in numbers.\n\nExample: 5000 (for $5,000)';
        break;
      case 'deadline':
        helpText += '📅 **Deadline**: Enter the project completion date.\n\nExample: 2024-03-15 or "2 weeks" or "1 month"';
        break;
      case 'milestones':
        helpText += '🎯 **Milestones**: Break your project into payment milestones.\n\nExample: "Design mockups - 30% payment"';
        break;
      default:
        helpText += 'Follow the prompts to complete your contract setup.';
    }

    await this.bot.sendMessage(chatId, helpText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Cancel', callback_data: 'contract_cancel_contract' }
        ]]
      }
    });
  }

  /**
   * Continue contract flow
   */
  private async continueContractFlow(chatId: number, userId: string): Promise<boolean> {
    const state = this.contractStates.get(userId);
    if (!state) {
      await this.bot.sendMessage(chatId, '❌ No active contract creation found. Please start a new contract.');
      return true;
    }

    await this.askForNextField(chatId, userId, state);
    return true;
  }

  async clearContractState(userId: string) {
    this.contractStates.delete(userId);
    await this.clearContractStateFromDB(userId);
  }

  /**
   * Clear contract creation state from database (internal method)
   */
  private async clearContractStateFromDB(userId: string): Promise<void> {
    try {
      await supabase
        .from('user_states')
        .delete()
        .eq('user_id', userId)
        .eq('state_type', 'contract_creation');
    } catch (error) {
      console.error('[ContractModule] Error clearing contract state from DB:', error);
    }
  }

  /**
   * Resend contract email to client
   */
  private async resendContractEmail(chatId: number, userId: string, contractId: string): Promise<boolean> {
    try {
      // Fetch contract details from database
      const { data: contract, error } = await supabase
        .from('project_contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (error || !contract) {
        await this.bot.sendMessage(chatId, '❌ Contract not found.');
        return true;
      }

      // Fetch legal contract details
      const { data: legalContract, error: legalError } = await supabase
        .from('legal_contracts')
        .select('*')
        .eq('id', contract.legal_contract_hash)
        .single();

      if (legalError || !legalContract) {
        await this.bot.sendMessage(chatId, '❌ Legal contract details not found.');
        return true;
      }

      if (!legalContract.client_email) {
        await this.bot.sendMessage(chatId, '❌ No client email found for this contract.');
        return true;
      }

      // Fetch milestones for email
      const { data: milestones } = await supabase
        .from('contract_milestones')
        .select('*')
        .eq('contract_id', contract.id)
        .order('created_at', { ascending: true });

      // Prepare contract data for email
      const contractData = {
        id: contract.id, // Use the UUID from the database for the approval link
        contractId: contract.id, // Use the UUID for the approval link
        projectTitle: contract.project_title,
        project_title: contract.project_title,
        projectDescription: contract.project_description,
        project_description: contract.project_description,
        freelancerName: legalContract.freelancer_name || 'Freelancer',
        freelancer_name: legalContract.freelancer_name || 'Freelancer',
        clientName: legalContract.client_name || 'Client',
        client_name: legalContract.client_name || 'Client',
        paymentAmount: contract.total_amount,
        total_amount: contract.total_amount,
        tokenType: this.getTokenTypeFromAddress(contract.token_address, contract.chain),
        token_type: this.getTokenTypeFromAddress(contract.token_address, contract.chain),
        chain: contract.chain,
        deadline: contract.deadline,
        contractHash: contract.legal_contract_hash,
        legal_contract_hash: contract.legal_contract_hash,
        createdAt: contract.created_at,
        created_at: contract.created_at,
        milestones: milestones || []
      };

      const emailTemplate = generateContractEmailTemplate(contractData);

      await sendEmail({
        to: legalContract.client_email,
        subject: `Contract Draft Ready - ${contract.project_title}`,
        html: emailTemplate
      });

      await this.bot.sendMessage(chatId,
        `✅ **Email Resent Successfully!**\n\n📧 Sent to: ${legalContract.client_email}\n📄 Contract: ${contract.project_title}`,
        { parse_mode: 'Markdown' }
      );

      return true;
    } catch (error) {
      console.error('[ContractModule] Error resending email:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to resend email. Please try again.');
      return true;
    }
  }

  /**
   * Send contract email to client internally (without bot interaction)
   */
  private async sendContractEmailInternal(contractId: string, clientEmail: string): Promise<void> {
    // Fetch contract details from database
    const { data: contract, error } = await supabase
      .from('project_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      throw new Error('Contract not found');
    }

    // Fetch legal contract details
    const { data: legalContract, error: legalError } = await supabase
      .from('legal_contracts')
      .select('*')
      .eq('id', contract.legal_contract_id)
      .single();

    if (legalError || !legalContract) {
      throw new Error('Legal contract details not found');
    }

    // Fetch milestones for email
    const { data: milestones } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: true });

    // Prepare contract data for email
    const contractData = {
      id: contract.id,
      contractId: contract.id,
      projectTitle: contract.project_title,
      project_title: contract.project_title,
      projectDescription: contract.project_description,
      project_description: contract.project_description,
      freelancerName: legalContract.freelancer_name || 'Freelancer',
      freelancer_name: legalContract.freelancer_name || 'Freelancer',
      clientName: legalContract.client_name || 'Client',
      client_name: legalContract.client_name || 'Client',
      paymentAmount: contract.total_amount,
      total_amount: contract.total_amount,
      tokenType: this.getTokenTypeFromAddress(contract.token_address, contract.chain),
      token_type: this.getTokenTypeFromAddress(contract.token_address, contract.chain),
      chain: contract.chain,
      deadline: contract.deadline,
      contractHash: contract.legal_contract_id,
      legal_contract_hash: contract.legal_contract_id,
      createdAt: contract.created_at,
      created_at: contract.created_at,
      milestones: milestones || []
    };

    const emailTemplate = generateContractEmailTemplate(contractData);

    await sendEmail({
      to: clientEmail,
      subject: `Contract Draft Ready - ${contract.project_title}`,
      html: emailTemplate
    });
  }

  /**
    * Send contract email to client manually
    */
  private async sendContractEmail(chatId: number, userId: string, contractId: string): Promise<boolean> {
    try {
      // Fetch contract details from database
      const { data: contract, error } = await supabase
        .from('project_contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (error || !contract) {
        await this.bot.sendMessage(chatId, '❌ Contract not found.');
        return true;
      }

      // Fetch legal contract details
      const { data: legalContract, error: legalError } = await supabase
        .from('legal_contracts')
        .select('*')
        .eq('id', contract.legal_contract_hash)
        .single();

      if (legalError || !legalContract) {
        await this.bot.sendMessage(chatId, '❌ Legal contract details not found.');
        return true;
      }

      if (!legalContract.client_email) {
        await this.bot.sendMessage(chatId, '❌ No client email found for this contract.');
        return true;
      }

      // Fetch milestones for email
      const { data: milestones } = await supabase
        .from('contract_milestones')
        .select('*')
        .eq('contract_id', contract.id)
        .order('created_at', { ascending: true });

      // Prepare contract data for email
      const contractData = {
        id: contract.id, // Use the UUID from the database for the approval link
        contractId: contract.id, // Use the UUID for the approval link
        projectTitle: contract.project_title,
        project_title: contract.project_title,
        projectDescription: contract.project_description,
        project_description: contract.project_description,
        freelancerName: legalContract.freelancer_name || 'Freelancer',
        freelancer_name: legalContract.freelancer_name || 'Freelancer',
        clientName: legalContract.client_name || 'Client',
        client_name: legalContract.client_name || 'Client',
        paymentAmount: contract.total_amount,
        total_amount: contract.total_amount,
        tokenType: this.getTokenTypeFromAddress(contract.token_address, contract.chain),
        token_type: this.getTokenTypeFromAddress(contract.token_address, contract.chain),
        chain: contract.chain,
        deadline: contract.deadline,
        contractHash: contract.legal_contract_hash,
        legal_contract_hash: contract.legal_contract_hash,
        createdAt: contract.created_at,
        created_at: contract.created_at,
        milestones: milestones || []
      };

      const emailTemplate = generateContractEmailTemplate(contractData);

      await sendEmail({
        to: legalContract.client_email,
        subject: `Contract Draft Ready - ${contract.project_title}`,
        html: emailTemplate
      });

      await this.bot.sendMessage(chatId,
        `✅ **Email sent successfully!**\n\n` +
        `📧 **To:** ${legalContract.client_email}\n` +
        `📄 **Contract:** ${contract.project_title}\n` +
        `💰 **Amount:** ${contract.total_amount} ${contractData.tokenType}\n\n` +
        `The client will receive the contract details and can proceed with approval.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📋 List All Contracts', callback_data: 'business_contracts' },
                { text: '🔄 Resend Email', callback_data: `contract_resend_email_${contractId}` }
              ]
            ]
          }
        }
      );

      // Track email sending
      trackEvent('contract_email_sent_manually', {
        contractId: contract.contract_id,
        clientEmail: legalContract.client_email
      }, userId);

      return true;
    } catch (error) {
      console.error('[ContractModule] Error sending contract email:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to send email. Please try again.');
      return true;
    }
  }

  /**
   * View contract details and generate PDF
   */
  private async viewContract(chatId: number, userId: string, contractId: string): Promise<boolean> {
    try {
      console.log('[ContractModule] Starting viewContract for contractId:', contractId, 'userId:', userId);

      await this.bot.sendMessage(chatId, '📄 **Generating Contract PDF...**\n\nPlease wait while I prepare your contract document.', {
        parse_mode: 'Markdown'
      });

      // Fetch contract details from database
      console.log('[ContractModule] Fetching contract from database...');
      const { data: contract, error } = await supabase
        .from('project_contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (error || !contract) {
        console.error('[ContractModule] Contract not found:', error);
        await this.bot.sendMessage(chatId, '❌ Contract not found.');
        return true;
      }

      console.log('[ContractModule] Contract found:', contract.contract_id);

      // Fetch milestones
      console.log('[ContractModule] Fetching milestones...');
      const { data: milestones } = await supabase
        .from('contract_milestones')
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: true });

      console.log('[ContractModule] Found', milestones?.length || 0, 'milestones');

      // Get freelancer info
      console.log('[ContractModule] Fetching freelancer info...');
      const { data: user } = await supabase
        .from('auth.users')
        .select('raw_user_meta_data, email')
        .eq('id', contract.freelancer_id)
        .single();

      console.log('[ContractModule] Freelancer info:', user?.raw_user_meta_data?.name);

      // Get legal contract details for client info
      let clientName = 'Client';
      let clientEmail = contract.client_email;
      
      if (contract.legal_contract_id) {
        const { data: legalContract } = await supabase
          .from('legal_contracts')
          .select('client_name, client_email')
          .eq('id', contract.legal_contract_id)
          .single();
        
        if (legalContract) {
          clientName = legalContract.client_name || clientEmail || 'Client';
          clientEmail = legalContract.client_email || clientEmail;
        }
      }

      // Determine token type more reliably
      const getTokenType = (tokenAddress: string | null, chain: string): string => {
        if (!tokenAddress) return 'USDC'; // Default fallback

        const address = tokenAddress.toLowerCase();

        // Base network USDC addresses
        if (chain === 'base') {
          if (address.includes('833589fcd6edb6e08f4c7c32d4f71b54bda02913')) return 'USDC';
        }

        // Celo network cUSD addresses  
        if (chain === 'celo') {
          if (address.includes('765de816845861e75a25fca122bb6898b8b1282a')) return 'cUSD';
        }

        // Fallback based on common patterns
        if (address.includes('usdc')) return 'USDC';
        if (address.includes('cusd')) return 'cUSD';

        return 'USDC'; // Default fallback
      };

      // Prepare contract data for PDF generation
      const contractData: ContractPDFData = {
        contractId: contractId,
        projectTitle: contract.project_title,
        projectDescription: contract.project_description || 'No description provided',
        clientName: clientName,
        clientEmail: clientEmail,
        freelancerName: user?.raw_user_meta_data?.name || 'Freelancer',
        totalAmount: contract.total_amount,
        tokenType: getTokenType(contract.token_address, contract.chain),
        chain: contract.chain,
        deadline: contract.deadline,
        status: contract.status,
        createdAt: contract.created_at,
        milestones: milestones?.map(m => ({
          title: m.title,
          description: m.description,
          amount: m.amount,
          deadline: m.due_date,
          status: m.status
        })) || []
      };

      // Generate PDF
      console.log('[ContractModule] Generating PDF...');
      const pdfBuffer = await generateContractPDF(contractData);
      console.log('[ContractModule] PDF generated successfully, size:', pdfBuffer.length, 'bytes');

      // Send PDF as document
      console.log('[ContractModule] Sending PDF document...');
      await this.bot.sendDocument(chatId, pdfBuffer, {
        caption: `📄 **Contract PDF Generated**\n\n` +
          `**ID:** ${contractData.contractId}\n` +
          `**Project:** ${contractData.projectTitle}\n` +
          `**Amount:** ${contractData.totalAmount} ${contractData.tokenType}\n` +
          `**Status:** ${contractData.status.toUpperCase()}\n\n` +
          `✅ **Review your contract and proceed with deployment when ready.**`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📧 Send to Client', callback_data: `contract_send_email_${contractId}` },
              { text: '📋 List All', callback_data: 'business_contracts' }
            ]
          ]
        }
      }, {
        filename: `contract_${contractData.contractId}.pdf`
      });

      console.log('[ContractModule] PDF document sent successfully');

      // Track PDF generation
      trackEvent('contract_pdf_generated', {
        contractId: contractData.contractId,
        hasMillestones: (contractData.milestones || []).length > 0
      }, userId);

      console.log('[ContractModule] viewContract completed successfully');
      return true;
    } catch (error) {
      console.error('[ContractModule] Error viewing contract:', error);

      // Send more specific error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.bot.sendMessage(chatId, `❌ Failed to generate contract PDF: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`);
      return true;
    }
  }

  /**
   * Get token type from address and chain
   */
  private getTokenTypeFromAddress(tokenAddress: string | null, chain: string): string {
    if (!tokenAddress) return 'USDC'; // Default fallback

    const address = tokenAddress.toLowerCase();

    // Base network tokens
    if (chain === 'base') {
      if (address === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') return 'USDC';
      if (address === '0x0000000000000000000000000000000000000000') return 'ETH';
    }

    // Celo network tokens  
    if (chain === 'celo') {
      if (address === '0x765de816845861e75a25fca122bb6898b8b1282a') return 'cUSD';
      if (address === '0x0000000000000000000000000000000000000000') return 'CELO';
    }

    // Ethereum network tokens
    if (chain === 'ethereum') {
      if (address === '0xa0b86a33e6441b8c4505e2c4b8b5b8e8e8e8e8e8') return 'USDC';
      if (address === '0x0000000000000000000000000000000000000000') return 'ETH';
    }

    // Fallback based on common patterns
    if (address.includes('833589fcd6edb6e08f4c7c32d4f71b54bda02913')) return 'USDC';
    if (address.includes('765de816845861e75a25fca122bb6898b8b1282a')) return 'cUSD';

    return 'USDC'; // Default fallback
  }
}