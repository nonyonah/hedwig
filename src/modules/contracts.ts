import * as TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import { legalContractService, ContractGenerationRequest } from '../services/legalContractService';
import { ProjectContract, ContractMilestone } from '../types/supabase';
import { trackEvent } from '../lib/posthog';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ContractCreationState {
  step: 'title' | 'description' | 'client_wallet' | 'client_email' | 'amount' | 'token' | 'chain' | 'deadline' | 'milestones' | 'refund_policy' | 'review' | 'completed';
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
    state.step = 'client_wallet';
    
    // Ensure state is saved
    this.contractStates.set(userId, state);

    await this.bot.sendMessage(chatId, 
      `✅ **Description saved**\n\n👤 **Client Wallet Address**\n\nPlease enter the client's wallet address (0x...):`,
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

    await this.bot.sendMessage(chatId, 
      `✅ **Amount:** $${amount}\n\n🪙 **Token Type**\n\nSelect the payment token:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💵 USDC', callback_data: 'contract_token_USDC' },
              { text: '🌍 cUSD', callback_data: 'contract_token_cUSD' }
            ],
            [
              { text: '🔷 USDT', callback_data: 'contract_token_USDT' },
              { text: '💎 DAI', callback_data: 'contract_token_DAI' }
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
    if (!state.currentMilestone || !state.milestoneStep) return false;

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
    message += `👤 **Client:** ${data.clientWallet}\n`;
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

    message += `\n⚡ **Next Steps:**\n1. Generate legal contract with AI\n2. Deploy smart contract\n3. Share with client for approval`;

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

      // Prepare contract generation request
      const contractRequest: ContractGenerationRequest = {
        projectTitle: state.data.projectTitle!,
        projectDescription: state.data.projectDescription!,
        clientName: state.data.clientName || 'Client',
        clientWallet: state.data.clientWallet!,
        freelancerName: user?.name || 'Freelancer',
        freelancerEmail: user?.email,
        freelancerWallet: '', // Will be filled from user's wallet
        paymentAmount: state.data.paymentAmount!,
        tokenType: state.data.tokenType!,
        chain: state.data.chain!,
        deadline: state.data.deadline!,
        milestones: state.milestones,
        refundPolicy: state.data.refundPolicy
      };

      // Generate contract with AI
      const result = await legalContractService.generateContract(contractRequest);

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate contract');
      }

      // Store contract in database
      const contractId = `contract_${Date.now()}_${userId}`;
      
      const { error: dbError } = await supabase
        .from('project_contracts')
        .insert({
          id: contractId,
          title: contractRequest.projectTitle,
          description: contractRequest.projectDescription,
          client_wallet: contractRequest.clientWallet,
          freelancer_id: userId,
          amount: contractRequest.paymentAmount,
          token_type: contractRequest.tokenType,
          chain: contractRequest.chain,
          deadline: contractRequest.deadline,
          status: 'draft',
          legal_document_hash: result.contractHash,
          created_at: new Date().toISOString()
        });

      if (dbError) {
        throw new Error('Failed to save contract to database');
      }

      // Store milestones if any
      if (state.milestones.length > 0) {
        const milestoneInserts = state.milestones.map((milestone, index) => ({
          contract_id: contractId,
          milestone_id: index + 1,
          title: milestone.title,
          description: milestone.description,
          amount: milestone.amount,
          deadline: milestone.deadline,
          status: 'pending' as const
        }));

        await supabase.from('contract_milestones').insert(milestoneInserts);
      }

      // Store legal document
      await legalContractService.storeContract(contractId, result.contractText!, result.contractHash!, result.metadata);

      // Clean up state
      this.contractStates.delete(userId);

      // Track success
      trackEvent('contract_generated', { contractId, hasMillestones: state.milestones.length > 0 }, userId);

      await this.bot.sendMessage(chatId, 
        `✅ **Contract Generated Successfully!**\n\n📄 **Contract ID:** ${contractId}\n📊 **Word Count:** ${result.metadata?.wordCount}\n🔐 **Document Hash:** ${result.contractHash?.substring(0, 16)}...\n\n🚀 **Next Steps:**\n1. Review the legal document\n2. Deploy smart contract\n3. Share with client\n\nUse /contracts to manage your contracts.`,
        { parse_mode: 'Markdown' }
      );

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
  isInContractFlow(userId: string): boolean {
    return this.contractStates.has(userId);
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

  clearContractState(userId: string) {
    this.contractStates.delete(userId);
  }
}