import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
// Generate proposal number function moved here
function generateProposalNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PROP-${year}${month}${day}-${random}`;
}
import { generateProposalPDF } from './pdf-generator';
import { sendEmailWithAttachment, generateProposalEmailTemplate } from '../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ProposalData {
  id?: string;
  user_id: string;
  user_identifier: string;
  proposal_number: string;
  freelancer_name: string;
  freelancer_email: string;
  client_name: string;
  client_email: string;
  service_type: string;
  project_description: string;
  scope_of_work?: string;
  timeline?: string;
  amount: number;
  currency: 'USD' | 'NGN';
  payment_terms?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  payment_methods: {
    usdc_base?: string;
    usdc_solana?: string;
    flutterwave?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

export class ProposalModule {
  private bot: TelegramBot;

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  // Main proposal creation flow
  async handleProposalCreation(chatId: number, userId: string, initialMessage?: string) {
    try {
      // Check if user has an ongoing proposal creation
      const ongoingProposal = await this.getOngoingProposal(userId);
      
      if (ongoingProposal) {
        return this.continueProposalCreation(chatId, userId, ongoingProposal, initialMessage);
      }

      // Start new proposal creation
      const proposalData: Partial<ProposalData> = {
        user_id: userId,
        user_identifier: userId,
        proposal_number: generateProposalNumber(),
        status: 'draft',
        currency: 'USD',
        service_type: 'Custom Service',
        payment_methods: {
          usdc_base: '',
          usdc_solana: '',
          flutterwave: true
        }
      };

      // Save initial proposal
      const { data: proposal, error } = await supabase
        .from('proposals')
        .insert([proposalData])
        .select()
        .single();

      if (error) throw error;

      // Start the creation flow
      await this.bot.sendMessage(chatId, 
        `📋 *Creating New Proposal ${proposal.proposal_number}*\n\n` +
        `Let's create a professional proposal for your client.\n\n` +
        `*Step 1/8:* What's your name (freelancer/service provider)?`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: `cancel_proposal_${proposal.id}` }
            ]]
          }
        }
      );

      // Set user state
      await this.setUserState(userId, 'creating_proposal', {
        proposal_id: proposal.id,
        step: 'freelancer_name'
      });

      return `Proposal creation started for ${proposal.proposal_number}`;
    } catch (error) {
      console.error('Error creating proposal:', error);
      return '❌ Failed to start proposal creation. Please try again.';
    }
  }

  // Continue proposal creation based on current step
  async continueProposalCreation(chatId: number, userId: string, proposalData: any, userInput?: string) {
    try {
      const { proposal_id, step } = proposalData;
      
      if (!userInput) {
        return this.sendStepPrompt(chatId, step, proposal_id);
      }

      // Process user input based on current step
      const updateData: any = {};
      let nextStep = '';
      let responseMessage = '';

      switch (step) {
        case 'freelancer_name':
          updateData.freelancer_name = userInput.trim();
          nextStep = 'freelancer_email';
          responseMessage = `✅ Freelancer name: ${userInput}\n\n*Step 2/8:* What's your email address?`;
          break;

        case 'freelancer_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address.';
          }
          updateData.freelancer_email = userInput.trim();
          nextStep = 'client_name';
          responseMessage = `✅ Email: ${userInput}\n\n*Step 3/8:* What's your client's name?`;
          break;

        case 'client_name':
          updateData.client_name = userInput.trim();
          nextStep = 'client_email';
          responseMessage = `✅ Client name: ${userInput}\n\n*Step 4/8:* What's your client's email address?`;
          break;

        case 'client_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address.';
          }
          updateData.client_email = userInput.trim();
          nextStep = 'project_description';
          responseMessage = `✅ Client email: ${userInput}\n\n*Step 5/8:* Describe the project overview:`;
          break;

        case 'project_description':
          updateData.project_description = userInput.trim();
          nextStep = 'scope_of_work';
          responseMessage = `✅ Project description saved\n\n*Step 6/8:* Define the scope of work (what exactly will you deliver)?`;
          break;

        case 'scope_of_work':
          updateData.scope_of_work = userInput.trim();
          nextStep = 'timeline';
          responseMessage = `✅ Scope of work saved\n\n*Step 7/8:* What's the project timeline? (e.g., "2-3 weeks" or "30 days")`;
          break;

        case 'timeline':
          updateData.timeline = userInput.trim();
          nextStep = 'amount';
          responseMessage = `✅ Timeline saved\n\n*Step 8/8:* What's the total investment? (e.g., 1500 USD or 600000 NGN)`;
          break;

        case 'amount':
          const amountData = this.parseAmount(userInput);
          if (!amountData) {
            return '❌ Please enter a valid amount (e.g., 1500 USD or 600000 NGN)';
          }
          updateData.amount = amountData.amount;
          updateData.currency = amountData.currency;
          nextStep = 'complete';
          break;
      }

      // Update proposal in database
      const { error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposal_id);

      if (error) throw error;

      if (nextStep === 'complete') {
        return this.completeProposalCreation(chatId, userId, proposal_id);
      }

      // Update user state and send next prompt
      await this.setUserState(userId, 'creating_proposal', {
        proposal_id,
        step: nextStep
      });

      await this.bot.sendMessage(chatId, responseMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: `cancel_proposal_${proposal_id}` }
          ]]
        }
      });

      return 'Proposal creation step completed';
    } catch (error) {
      console.error('Error continuing proposal creation:', error);
      return '❌ Error processing proposal data. Please try again.';
    }
  }

  // Complete proposal creation and show preview
  async completeProposalCreation(chatId: number, userId: string, proposalId: string) {
    try {
      // Get complete proposal data
      const { data: proposal, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (error) throw error;

      // Clear user state
      await this.clearUserState(userId);

      // Generate preview message
      const previewMessage = this.generateProposalPreview(proposal);

      await this.bot.sendMessage(chatId, previewMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📧 Send to Client', callback_data: `send_proposal_${proposalId}` },
              { text: '📄 Generate PDF', callback_data: `pdf_proposal_${proposalId}` }
            ],
            [
              { text: '✏️ Edit Proposal', callback_data: `edit_proposal_${proposalId}` },
              { text: '🗑️ Delete', callback_data: `delete_proposal_${proposalId}` }
            ]
          ]
        }
      });

      return 'Proposal created successfully!';
    } catch (error) {
      console.error('Error completing proposal:', error);
      return '❌ Error completing proposal creation.';
    }
  }

  // Generate proposal preview
  private generateProposalPreview(proposal: ProposalData): string {
    return (
      `📋 *Proposal Preview*\n\n` +
      `*Proposal #:* ${proposal.proposal_number}\n` +
      `*From:* ${proposal.freelancer_name} (${proposal.freelancer_email})\n` +
      `*To:* ${proposal.client_name} (${proposal.client_email})\n` +
      `*Project:* ${proposal.project_description}\n` +
      `*Scope:* ${proposal.scope_of_work}\n` +
      `*Timeline:* ${proposal.timeline}\n` +
      `*Investment:* ${proposal.amount} ${proposal.currency}\n` +
      `*Status:* ${proposal.status.toUpperCase()}\n\n` +
      `*Payment Methods Available:*\n` +
      `💰 USDC (Base Network)\n` +
      `💰 USDC (Solana)\n` +
      `💳 Bank Transfer (Flutterwave)\n\n` +
      `What would you like to do next?`
    );
  }

  // Handle callback queries for proposal actions
  async handleProposalCallback(callbackQuery: TelegramBot.CallbackQuery, userId?: string) {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data;
    
    if (!chatId || !data) return;

    try {
      if (data.startsWith('send_proposal_')) {
        const proposalId = data.replace('send_proposal_', '');
        await this.sendProposalToClient(chatId, proposalId);
      } else if (data.startsWith('pdf_proposal_')) {
        const proposalId = data.replace('pdf_proposal_', '');
        await this.generateAndSendPDF(chatId, proposalId);
      } else if (data.startsWith('edit_proposal_')) {
        const proposalId = data.replace('edit_proposal_', '');
        await this.editProposal(chatId, proposalId);
      } else if (data.startsWith('delete_proposal_')) {
        const proposalId = data.replace('delete_proposal_', '');
        await this.deleteProposal(chatId, proposalId);
      } else if (data.startsWith('confirm_delete_proposal_')) {
        const proposalId = data.replace('confirm_delete_proposal_', '');
        await this.confirmDeleteProposal(chatId, proposalId);
      } else if (data.startsWith('view_proposal_')) {
        const proposalId = data.replace('view_proposal_', '');
        await this.showProposalPreview(chatId, proposalId);
      } else if (data.startsWith('edit_client_') || data.startsWith('edit_project_') || 
                 data.startsWith('edit_amount_') || data.startsWith('edit_timeline_')) {
        await this.handleEditSubAction(callbackQuery);
      } else if (data.startsWith('cancel_proposal_')) {
        const proposalId = data.replace('cancel_proposal_', '');
        // Get userId for state clearing
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          actualUserId = user?.id || chatId.toString();
        }
        await this.cancelProposalCreation(chatId, proposalId, actualUserId);
      }

      await this.bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Error handling proposal callback:', error);
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred' });
    }
  }

  // Send proposal to client via email
  private async sendProposalToClient(chatId: number, proposalId: string) {
    try {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (!proposal) throw new Error('Proposal not found');

      // Generate PDF
      const pdfBuffer = await generateProposalPDF(proposal);
      
      // Send email with PDF attachment
      await sendEmailWithAttachment({
        to: proposal.client_email,
        subject: `Project Proposal ${proposal.proposal_number} from ${proposal.freelancer_name}`,
        html: generateProposalEmailTemplate(proposal),
        attachments: [{
          filename: `proposal-${proposal.proposal_number}.pdf`,
          content: pdfBuffer
        }]
      });

      // Update proposal status
      await supabase
        .from('proposals')
        .update({ status: 'sent' })
        .eq('id', proposalId);

      await this.bot.sendMessage(chatId, 
        `✅ Proposal ${proposal.proposal_number} sent successfully to ${proposal.client_email}!`
      );
    } catch (error) {
      console.error('Error sending proposal:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to send proposal. Please try again.');
    }
  }

  // Generate and send PDF to user
  private async generateAndSendPDF(chatId: number, proposalId: string) {
    try {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (!proposal) throw new Error('Proposal not found');

      const pdfBuffer = await generateProposalPDF(proposal);
      
      await this.bot.sendDocument(chatId, pdfBuffer, {
        caption: `📄 Proposal ${proposal.proposal_number} PDF generated successfully!`
      }, {
        filename: `proposal-${proposal.proposal_number}.pdf`
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to generate PDF. Please try again.');
    }
  }

  // Edit proposal
  private async editProposal(chatId: number, proposalId: string) {
    try {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (!proposal) throw new Error('Proposal not found');

      await this.bot.sendMessage(chatId, 
        `✏️ *Edit Proposal ${proposal.proposal_number}*\n\n` +
        `What would you like to edit?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '👤 Client Info', callback_data: `edit_client_${proposalId}` },
                { text: '📋 Project Details', callback_data: `edit_project_${proposalId}` }
              ],
              [
                { text: '💰 Amount', callback_data: `edit_amount_${proposalId}` },
                { text: '⏰ Timeline', callback_data: `edit_timeline_${proposalId}` }
              ],
              [
                { text: '🔙 Back to Proposal', callback_data: `view_proposal_${proposalId}` }
              ]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error editing proposal:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to load proposal for editing. Please try again.');
    }
  }

  // Delete proposal
  private async deleteProposal(chatId: number, proposalId: string) {
    try {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('proposal_number, status')
        .eq('id', proposalId)
        .single();

      if (!proposal) throw new Error('Proposal not found');

      await this.bot.sendMessage(chatId, 
        `🗑️ *Delete Proposal ${proposal.proposal_number}*\n\n` +
        `Are you sure you want to delete this proposal?\n` +
        `This action cannot be undone.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Yes, Delete', callback_data: `confirm_delete_proposal_${proposalId}` },
                { text: '❌ Cancel', callback_data: `view_proposal_${proposalId}` }
              ]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error deleting proposal:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to delete proposal. Please try again.');
    }
  }

  // Confirm proposal deletion
  private async confirmDeleteProposal(chatId: number, proposalId: string) {
    try {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('proposal_number')
        .eq('id', proposalId)
        .single();

      if (!proposal) throw new Error('Proposal not found');

      // Delete the proposal
      await supabase
        .from('proposals')
        .delete()
        .eq('id', proposalId);

      await this.bot.sendMessage(chatId, 
        `✅ Proposal ${proposal.proposal_number} has been deleted successfully.`
      );
    } catch (error) {
      console.error('Error confirming proposal deletion:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to delete proposal. Please try again.');
    }
  }

  // Show proposal preview
  private async showProposalPreview(chatId: number, proposalId: string) {
    try {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (!proposal) throw new Error('Proposal not found');

      const previewText = this.generateProposalPreview(proposal);
      
      await this.bot.sendMessage(chatId, previewText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📧 Send to Client', callback_data: `send_proposal_${proposalId}` },
              { text: '📄 Generate PDF', callback_data: `pdf_proposal_${proposalId}` }
            ],
            [
              { text: '✏️ Edit Proposal', callback_data: `edit_proposal_${proposalId}` },
              { text: '🗑️ Delete', callback_data: `delete_proposal_${proposalId}` }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Error showing proposal preview:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to load proposal preview. Please try again.');
    }
  }

  // Handle edit sub-actions
  private async handleEditSubAction(callbackQuery: any) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    try {
      if (data.startsWith('edit_client_')) {
        const proposalId = data.replace('edit_client_', '');
        await this.startEditClientInfo(chatId, proposalId);
      } else if (data.startsWith('edit_project_')) {
        const proposalId = data.replace('edit_project_', '');
        await this.startEditProjectDetails(chatId, proposalId);
      } else if (data.startsWith('edit_amount_')) {
        const proposalId = data.replace('edit_amount_', '');
        await this.startEditAmount(chatId, proposalId);
      } else if (data.startsWith('edit_timeline_')) {
        const proposalId = data.replace('edit_timeline_', '');
        await this.startEditTimeline(chatId, proposalId);
      }
    } catch (error) {
      console.error('Error handling edit sub-action:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to start editing. Please try again.');
    }
  }

  // Start editing client info
  private async startEditClientInfo(chatId: number, proposalId: string) {
    await this.bot.sendMessage(chatId, 
      '👤 *Edit Client Information*\n\n' +
      'What would you like to update?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📝 Client Name', callback_data: `edit_client_name_${proposalId}` },
              { text: '📧 Client Email', callback_data: `edit_client_email_${proposalId}` }
            ],
            [
              { text: '🔙 Back to Edit Menu', callback_data: `edit_proposal_${proposalId}` }
            ]
          ]
        }
      }
    );
  }

  // Start editing project details
  private async startEditProjectDetails(chatId: number, proposalId: string) {
    await this.bot.sendMessage(chatId, 
      '📋 *Edit Project Details*\n\n' +
      'What would you like to update?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📝 Project Description', callback_data: `edit_description_${proposalId}` },
              { text: '🎯 Scope of Work', callback_data: `edit_scope_${proposalId}` }
            ],
            [
              { text: '🔙 Back to Edit Menu', callback_data: `edit_proposal_${proposalId}` }
            ]
          ]
        }
      }
    );
  }

  // Start editing amount
  private async startEditAmount(chatId: number, proposalId: string) {
    await this.bot.sendMessage(chatId, 
      '💰 *Edit Amount*\n\n' +
      'Please enter the new total investment amount:\n' +
      '(e.g., 1500 USD or 600000 NGN)',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔙 Back to Edit Menu', callback_data: `edit_proposal_${proposalId}` }
            ]
          ]
        }
      }
    );

    // Set user state for editing amount
    const userId = chatId.toString();
    await this.setUserState(userId, 'editing_proposal', {
      proposalId,
      editField: 'amount'
    });
  }

  // Start editing timeline
  private async startEditTimeline(chatId: number, proposalId: string) {
    await this.bot.sendMessage(chatId, 
      '⏰ *Edit Timeline*\n\n' +
      'Please enter the new project timeline:\n' +
      '(e.g., "2-3 weeks" or "30 days")',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔙 Back to Edit Menu', callback_data: `edit_proposal_${proposalId}` }
            ]
          ]
        }
      }
    );

    // Set user state for editing timeline
    const userId = chatId.toString();
    await this.setUserState(userId, 'editing_proposal', {
      proposalId,
      editField: 'timeline'
    });
  }

  // Utility functions
  private async getOngoingProposal(userId: string) {
    const { data } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_proposal')
      .single();
    
    return data?.state_data;
  }

  private async setUserState(userId: string, stateType: string, stateData: any) {
    await supabase
      .from('user_states')
      .upsert({
        user_id: userId,
        state_type: stateType,
        state_data: stateData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,state_type'
      });
  }

  private async clearUserState(userId: string) {
    await supabase
      .from('user_states')
      .delete()
      .eq('user_id', userId)
      .eq('state_type', 'creating_proposal');
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private parseAmount(input: string): { amount: number; currency: 'USD' | 'NGN' } | null {
    const match = input.match(/(\d+(?:\.\d+)?)\s*(USD|NGN|usd|ngn|\$|₦)?/i);
    if (!match) return null;

    const amount = parseFloat(match[1]);
    let currency: 'USD' | 'NGN' = 'USD';

    if (match[2]) {
      const currencyStr = match[2].toUpperCase();
      if (currencyStr === 'NGN' || currencyStr === '₦') {
        currency = 'NGN';
      }
    }

    return { amount, currency };
  }

  async cancelProposalCreation(chatId: number, proposalId: string, userId?: string) {
    try {
      // Delete the draft proposal
      await supabase
        .from('proposals')
        .delete()
        .eq('id', proposalId)
        .eq('status', 'draft');

      // Clear user state if userId is provided
      if (userId) {
        await this.clearUserState(userId);
      } else {
        // Fallback: get userId from chatId
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', chatId)
          .single();
        
        const fallbackUserId = user?.id || chatId.toString();
        await this.clearUserState(fallbackUserId);
      }

      await this.bot.sendMessage(chatId, '❌ Proposal creation cancelled.');
    } catch (error) {
      console.error('Error cancelling proposal:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to cancel proposal.');
    }
  }

  private async sendStepPrompt(chatId: number, step: string, proposalId: string) {
    const prompts: { [key: string]: string } = {
      'freelancer_name': '*Step 1/8:* What\'s your name (freelancer/service provider)?',
      'freelancer_email': '*Step 2/8:* What\'s your email address?',
      'client_name': '*Step 3/8:* What\'s your client\'s name?',
      'client_email': '*Step 4/8:* What\'s your client\'s email address?',
      'project_description': '*Step 5/8:* Describe the project overview:',
      'scope_of_work': '*Step 6/8:* Define the scope of work (what exactly will you deliver)?',
      'timeline': '*Step 7/8:* What\'s the project timeline? (e.g., "2-3 weeks" or "30 days")',
      'amount': '*Step 8/8:* What\'s the total investment? (e.g., 1500 USD or 600000 NGN)'
    };

    const message = prompts[step] || 'Please provide the required information.';
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Cancel', callback_data: `cancel_proposal_${proposalId}` }
        ]]
      }
    });
  }
}