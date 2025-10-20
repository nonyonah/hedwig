import * as TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import { NaturalProposalGenerator } from '../lib/naturalProposalGenerator';
import { trackEvent } from '../lib/posthog';
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
import { sendEmailWithAttachment, generateNaturalProposalEmail } from '../lib/emailService';

const naturalGenerator = new NaturalProposalGenerator();

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
  freelancer_title?: string;
  freelancer_experience?: string;
  client_name: string;
  client_email: string;
  client_company?: string;
  client_industry?: string;
  service_type: string;
  project_description: string; // This will be used as project title
  scope_of_work?: string; // This will be used as deliverables
  timeline?: string;
  amount: number;
  currency: 'USD' | 'NGN';
  payment_terms?: string; // This will be used as extra notes
  project_complexity?: 'simple' | 'moderate' | 'complex';
  communication_style?: 'formal' | 'casual' | 'professional';
  status: 'draft' | 'sent' | 'under_negotiation' | 'revised' | 'accepted' | 'rejected' | 'completed';
  negotiation_notes?: string;
  client_feedback?: string;
  revision_count?: number;
  last_revision_date?: string;
  payment_methods: {
    usdc_base?: string;
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

      // Get user info for personalization
      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .single();

      // Show personalization with user info and edit option
      const personalizationMessage = 
        `📋 **Proposal from ${userData?.name || 'Unknown User'}**\n\n` +
        `👤 **Your Information:**\n` +
        `Name: ${userData?.name || 'Not set'}\n` +
        `Email: ${userData?.email || 'Not set'}\n\n` +
        `This information will be used in your proposal. Would you like to edit it or continue?`;

      await this.bot.sendMessage(chatId, personalizationMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Continue with Proposal', callback_data: 'continue_proposal' }],
            [{ text: '✏️ Edit My Info', callback_data: 'edit_user_info' }]
          ]
        }
      });

      return 'Proposal personalization shown';
    } catch (error) {
      console.error('Error creating proposal:', error);
      return '❌ Failed to start proposal creation. Please try again.';
    }
  }

  // Continue with actual proposal creation after personalization
  async continueProposalCreationFlow(chatId: number, userId: string) {
    try {
      // Get user info for required fields
      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .single();

      // Start new proposal creation
      const proposalData: Partial<ProposalData> = {
        user_id: userId,
        user_identifier: userId,
        proposal_number: generateProposalNumber(),
        freelancer_name: userData?.name || 'Unknown User',
        freelancer_email: userData?.email || 'noreply@hedwigbot.xyz',
        status: 'draft',
        currency: 'USD',
        service_type: 'Custom Service',
        project_complexity: 'moderate',
        communication_style: 'professional',
        revision_count: 0,
        payment_methods: {
          usdc_base: ''
        }
      };

      // Save initial proposal
      const { data: proposal, error } = await supabase
        .from('proposals')
        .insert([proposalData])
        .select()
        .single();

      if (error) throw error;

      // Start the creation flow with client information
      await this.bot.sendMessage(chatId, 
        `📋 **Creating New Proposal ${proposal.proposal_number}**\n\n` +
        `Let's create a personalized, professional proposal for your client.\n\n` +
        `This will generate a natural language proposal that invites discussion and negotiation.\n\n` +
        `**Step 1/9:** Who is the client? (Enter their name)`,
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
        step: 'client_name'
      });

      return `Proposal creation started for ${proposal.proposal_number}`;
    } catch (error) {
      console.error('Error continuing proposal creation:', error);
      return '❌ Failed to continue proposal creation. Please try again.';
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
        case 'client_name':
          updateData.client_name = userInput.trim();
          nextStep = 'client_company';
          responseMessage = `✅ Client name: ${userInput}\n\n**Step 2/9:** What's the client's company name? (Type "skip" if individual client)`;
          break;

        case 'client_company':
          if (userInput.trim().toLowerCase() !== 'skip') {
            updateData.client_company = userInput.trim();
          }
          nextStep = 'client_industry';
          responseMessage = `✅ Company info saved\n\n**Step 3/9:** What industry is the client in? (e.g., "E-commerce", "Healthcare", "Education", or "skip")`;
          break;

        case 'client_industry':
          if (userInput.trim().toLowerCase() !== 'skip') {
            updateData.client_industry = userInput.trim();
          }
          nextStep = 'client_email';
          responseMessage = `✅ Industry info saved\n\n**Step 4/9:** What's the client's email address?`;
          break;

        case 'client_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address.';
          }
          updateData.client_email = userInput.trim();
          nextStep = 'project_description';
          responseMessage = `✅ Client email: ${userInput}\n\n**Step 5/9:** What's the project title? (e.g., "Website Redesign" or "Mobile App Development")`;
          break;

        case 'project_description':
          updateData.project_description = userInput.trim();
          nextStep = 'scope_of_work';
          responseMessage = `✅ Project title saved\n\n**Step 6/9:** What are the deliverables? (List what you'll provide, separated by commas)`;
          break;

        case 'scope_of_work':
          updateData.scope_of_work = userInput.trim();
          nextStep = 'project_complexity';
          responseMessage = `✅ Deliverables saved\n\n**Step 7/9:** How would you rate the project complexity?\n\n🟢 Type "simple" - Basic tasks, straightforward requirements\n🟡 Type "moderate" - Standard complexity, some challenges\n🔴 Type "complex" - Advanced requirements, significant challenges`;
          break;

        case 'project_complexity':
          const complexity = userInput.trim().toLowerCase();
          if (!['simple', 'moderate', 'complex'].includes(complexity)) {
            return '❌ Please choose: simple, moderate, or complex';
          }
          updateData.project_complexity = complexity as 'simple' | 'moderate' | 'complex';
          nextStep = 'timeline';
          responseMessage = `✅ Complexity set to ${complexity}\n\n**Step 8/9:** What's the timeline? (e.g., "2 weeks", "1 month", "by March 15th")`;
          break;

        case 'timeline':
          updateData.timeline = userInput.trim();
          nextStep = 'amount';
          responseMessage = `✅ Timeline saved\n\n**Step 9/9:** What's the budget? (e.g., 1500 USD or 600000 NGN)`;
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

      // Track proposal_created event
      try {
        const { HedwigEvents } = await import('../lib/posthog');
        await HedwigEvents.proposalCreated(userId, proposalId, proposal.project_description || 'Untitled Project', proposal.amount || 0, proposal.currency || 'USD');
        console.log('PostHog: Proposal created event tracked successfully');
      } catch (trackingError) {
        console.error('PostHog tracking error for proposal_created:', trackingError);
      }

      // Award referral points for first proposal creation
      try {
        const { awardActionPoints, awardMilestoneBadges } = await import('../lib/referralService');
        await awardActionPoints(userId, 'first_proposal');
        await awardMilestoneBadges(userId);
        console.log('[ProposalModule] Referral points awarded for first proposal creation');
      } catch (error) {
        console.error('[ProposalModule] Error awarding referral points:', error);
      }

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
              { text: '📄 Generate Invoice', callback_data: `generate_invoice_${proposalId}` },
              { text: '✏️ Edit Proposal', callback_data: `edit_proposal_${proposalId}` }
            ],
            [
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
    const naturalInputs = NaturalProposalGenerator.standardizeProposalInputs(proposal);
    
    return naturalGenerator.generateTelegramPreview(naturalInputs);
  }

  // Generate invoice from proposal
  private async generateInvoiceFromProposal(chatId: number, proposalId: string, userId?: string) {
    try {
      // Get proposal data
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (proposalError || !proposal) {
        await this.bot.sendMessage(chatId, '❌ Proposal not found.');
        return;
      }

      // Get user ID if not provided
      let actualUserId = userId;
      if (!actualUserId) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', chatId)
          .single();
        actualUserId = user?.id;
      }

      if (!actualUserId) {
        await this.bot.sendMessage(chatId, '❌ User not found.');
        return;
      }

      // Generate invoice number
      const generateInvoiceNumber = (): string => {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `INV-${year}${month}${day}-${random}`;
      };

      // Create invoice data from proposal
      const invoiceData = {
        user_id: actualUserId,
        user_identifier: actualUserId,
        invoice_number: generateInvoiceNumber(),
        freelancer_name: proposal.freelancer_name,
        freelancer_email: proposal.freelancer_email,
        client_name: proposal.client_name,
        client_email: proposal.client_email,
        project_description: proposal.project_description,
        quantity: 1,
        rate: proposal.amount,
        amount: proposal.amount,
        currency: proposal.currency || 'USD',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        status: 'draft',
        payment_methods: {
          usdc_base: proposal.payment_methods?.usdc_base || ''
        },
        linked_proposal_id: proposalId
      };

      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert([invoiceData])
        .select()
        .single();

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        await this.bot.sendMessage(chatId, '❌ Error creating invoice. Please try again.');
        return;
      }

      // Update proposal with linked invoice ID
      await supabase
        .from('proposals')
        .update({ linked_invoice_id: invoice.id })
        .eq('id', proposalId);

      // Send success message with invoice preview
      const previewMessage = 
        `✅ **Invoice Generated Successfully!**\n\n` +
        `📄 **Invoice ${invoice.invoice_number}**\n` +
        `🔗 Linked to Proposal ${proposal.proposal_number}\n\n` +
        `**Details:**\n` +
        `• Client: ${invoice.client_name}\n` +
        `• Project: ${invoice.project_description}\n` +
        `• Amount: ${invoice.amount} ${invoice.currency}\n` +
        `• Due Date: ${invoice.due_date}\n\n` +
        `The invoice is ready for review and sending.`;

      await this.bot.sendMessage(chatId, previewMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📧 Send Invoice', callback_data: `send_invoice_${invoice.id}` },
              { text: '📄 Generate PDF', callback_data: `pdf_invoice_${invoice.id}` }
            ],
            [
              { text: '✏️ Edit Invoice', callback_data: `edit_invoice_${invoice.id}` },
              { text: '🔙 Back to Proposal', callback_data: `view_proposal_${proposalId}` }
            ]
          ]
        }
      });

    } catch (error) {
      console.error('Error generating invoice from proposal:', error);
      await this.bot.sendMessage(chatId, '❌ Error generating invoice. Please try again.');
    }
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
      } else if (data.startsWith('generate_invoice_')) {
        const proposalId = data.replace('generate_invoice_', '');
        await this.generateInvoiceFromProposal(chatId, proposalId, userId);
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
      } else if (data === 'continue_proposal') {
        // Handle continue proposal button
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          if (!user?.id) {
            // Create user if doesn't exist
            const { data: newUserId, error } = await supabase.rpc('get_or_create_telegram_user', {
              p_telegram_chat_id: chatId,
              p_telegram_username: null,
              p_telegram_first_name: null,
              p_telegram_last_name: null,
              p_telegram_language_code: null,
            });
            if (error) {
              console.error('Error creating user:', error);
              await this.bot.sendMessage(chatId, '❌ Error accessing user information. Please try again.');
              return;
            }
            actualUserId = newUserId;
          } else {
            actualUserId = user.id;
          }
        }
        await this.continueProposalCreationFlow(chatId, actualUserId as string);
      } else if (data === 'edit_user_info') {
        // Handle edit user info button
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          if (!user?.id) {
            // Create user if doesn't exist
            const { data: newUserId, error } = await supabase.rpc('get_or_create_telegram_user', {
              p_telegram_chat_id: chatId,
              p_telegram_username: null,
              p_telegram_first_name: null,
              p_telegram_last_name: null,
              p_telegram_language_code: null,
            });
            if (error) {
              console.error('Error creating user:', error);
              await this.bot.sendMessage(chatId, '❌ Error accessing user information. Please try again.');
              return;
            }
            actualUserId = newUserId;
          } else {
            actualUserId = user.id;
          }
        }
        await this.handleEditUserInfo(chatId, actualUserId as string);
      } else if (data === 'edit_user_field_name') {
        // Handle edit name field
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          if (!user?.id) {
            // Create user if doesn't exist
            const { data: newUserId, error } = await supabase.rpc('get_or_create_telegram_user', {
              p_telegram_chat_id: chatId,
              p_telegram_username: null,
              p_telegram_first_name: null,
              p_telegram_last_name: null,
              p_telegram_language_code: null,
            });
            if (error) {
              console.error('Error creating user:', error);
              await this.bot.sendMessage(chatId, '❌ Error accessing user information. Please try again.');
              return;
            }
            actualUserId = newUserId;
          } else {
            actualUserId = user.id;
          }
        }
        await this.handleEditUserField(chatId, actualUserId as string, 'name');
      } else if (data === 'edit_user_field_email') {
        // Handle edit email field
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          if (!user?.id) {
            // Create user if doesn't exist
            const { data: newUserId, error } = await supabase.rpc('get_or_create_telegram_user', {
              p_telegram_chat_id: chatId,
              p_telegram_username: null,
              p_telegram_first_name: null,
              p_telegram_last_name: null,
              p_telegram_language_code: null,
            });
            if (error) {
              console.error('Error creating user:', error);
              await this.bot.sendMessage(chatId, '❌ Error accessing user information. Please try again.');
              return;
            }
            actualUserId = newUserId;
          } else {
            actualUserId = user.id;
          }
        }
        await this.handleEditUserField(chatId, actualUserId as string, 'email');
      } else if (data === 'back_to_proposal') {
        // Handle back to proposal button
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          actualUserId = user?.id || chatId.toString();
        }
        await this.continueProposalCreationFlow(chatId, actualUserId as string);
      } else if (data === 'cancel_user_edit') {
        // Handle cancel user edit button
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          actualUserId = user?.id || chatId.toString();
        }
        await this.clearUserState(actualUserId as string);
        await this.bot.sendMessage(chatId, '❌ Edit cancelled. What would you like to do next?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Edit User Info', callback_data: 'edit_user_info' }],
              [{ text: '📄 Continue Proposal', callback_data: 'continue_proposal' }]
            ]
          }
        });
      } else if (data === 'cancel_proposal_creation') {
        // Handle cancel proposal creation button
        let actualUserId = userId;
        if (!actualUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_chat_id', chatId)
            .single();
          actualUserId = user?.id || chatId.toString();
        }
        
        // Get ongoing proposal to cancel
        const ongoingProposal = await this.getOngoingProposal(actualUserId as string);
        if (ongoingProposal) {
          await this.cancelProposalCreation(chatId, ongoingProposal.id, actualUserId as string);
        } else {
          await this.bot.sendMessage(chatId, '❌ No ongoing proposal found to cancel.');
        }
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
      
      // Generate natural language email content
      const naturalInputs = {
        freelancerName: proposal.freelancer_name,
        freelancerTitle: proposal.freelancer_title || 'Professional',
        clientName: proposal.client_name,
        clientCompany: proposal.client_company,
        clientIndustry: proposal.client_industry,
        projectTitle: proposal.project_description,
        projectDescription: proposal.scope_of_work || '',
        scopeOfWork: proposal.scope_of_work || '',
        deliverables: proposal.scope_of_work?.split(',').map(d => d.trim()) || [],
        timeline: proposal.timeline || '',
        budget: proposal.amount,
        currency: proposal.currency,
        complexity: proposal.project_complexity || 'moderate',
        communicationStyle: proposal.communication_style || 'professional'
      };
      
      const emailContent = naturalGenerator.generateEmailTemplate(naturalInputs);
       
       // Send email with PDF attachment
       await sendEmailWithAttachment({
         to: proposal.client_email,
         subject: `Project Proposal: ${proposal.project_description} - ${proposal.freelancer_name}`,
         html: generateNaturalProposalEmail(emailContent),
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
        `✏️ **Edit Proposal ${proposal.proposal_number}**\n\n` +
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
        `🗑️ **Delete Proposal ${proposal.proposal_number}**\n\n` +
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
      '👤 **Edit Client Information**\n\n' +
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
      '📋 **Edit Project Details**\n\n' +
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
      '💰 **Edit Amount**\n\n' +
      'Please enter the new total rate amount:\n' +
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
      '⏰ **Edit Timeline**\n\n' +
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
      .in('state_type', ['creating_proposal', 'editing_user_info']);
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
      'freelancer_name': '**Step 1/9:** What\'s your name (freelancer/service provider)?',
      'freelancer_email': '**Step 2/9:** What\'s your email address?',
      'client_name': '**Step 3/9:** Who is the client? (Enter their name)',
      'client_email': '**Step 4/9:** What\'s the client\'s email address?',
      'project_description': '**Step 5/9:** What\'s the project title? (e.g., "Website Redesign" or "Mobile App Development")',
      'scope_of_work': '**Step 6/9:** What are the deliverables? (List what you\'ll provide, separated by commas)',
      'timeline': '**Step 7/9:** What\'s the timeline? (e.g., "2 weeks", "1 month", "by March 15th")',
      'amount': '**Step 8/9:** What\'s the budget? (e.g., 1500 USD or 600000 NGN)',
      'payment_terms': '**Step 9/9:** Any extra notes? (Optional - additional context, special requirements, etc.)'
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

  /**
   * Handle editing user information during proposal creation
   */
  async handleEditUserInfo(chatId: number, userId: string) {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const message = `📝 **Edit Your Information**\n\n` +
        `👤 **Name:** ${user.name || 'Not set'}\n` +
        `📧 **Email:** ${user.email || 'Not set'}\n\n` +
        `What would you like to edit?`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👤 Edit Name', callback_data: `edit_user_field_name` }],
            [{ text: '📧 Edit Email', callback_data: `edit_user_field_email` }],
            [{ text: '↩️ Back to Proposal', callback_data: 'back_to_proposal' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error handling edit user info:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading user information. Please try again.');
    }
  }

  /**
   * Handle editing a specific user field
   */
  async handleEditUserField(chatId: number, userId: string, field: 'name' | 'email') {
    try {
      const fieldName = field === 'name' ? 'Name' : 'Email';
      const prompt = field === 'name' 
        ? 'Please enter your new name:'
        : 'Please enter your new email address:';

      await this.setUserState(userId, 'editing_user_info', {
        field: field,
        context: 'proposal'
      });

      await this.bot.sendMessage(chatId, `📝 **Edit ${fieldName}**\n\n${prompt}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'cancel_user_edit' }
          ]]
        }
      });
    } catch (error) {
      console.error('Error handling edit user field:', error);
      await this.bot.sendMessage(chatId, '❌ Error setting up field editing. Please try again.');
    }
  }

  /**
   * Handle user input during proposal creation flow
   */
  public async handleUserInput(chatId: number, userId: string, userInput: string) {
    try {
      // Get user's current state
      const { data: userState } = await supabase
        .from('user_states')
        .select('state_type, state_data')
        .eq('user_id', userId)
        .single();

      if (!userState) {
        return 'No active proposal creation found.';
      }

      // Handle proposal creation flow
      if (userState.state_type === 'creating_proposal') {
        return await this.continueProposalCreation(chatId, userId, userState.state_data, userInput);
      }

      return 'Unknown state for proposal creation.';
    } catch (error) {
      console.error('Error handling user input:', error);
      return '❌ Error processing your input. Please try again.';
    }
  }

  /**
   * Handle user info edit input
   */
  public async handleUserInfoEditInput(chatId: number, userId: string, field: string, userInput: string) {
    try {
      // Validate email if editing email
      if (field === 'email' && !this.isValidEmail(userInput)) {
        return '❌ Please enter a valid email address.';
      }

      // Update user in database
      const updateData = { [field]: userInput.trim() };
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      // Clear user state
      await this.clearUserState(userId);

      // Send confirmation message
      const fieldName = field === 'name' ? 'Name' : 'Email';
      const message = `✅ **${fieldName} Updated Successfully!**\n\n` +
        `Your ${field} has been updated to: **${userInput.trim()}**\n\n` +
        `What would you like to do next?`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Edit More Info', callback_data: 'edit_user_info' }],
            [{ text: '📄 Continue Proposal', callback_data: 'continue_proposal' }],
            [{ text: '❌ Cancel Proposal', callback_data: 'cancel_proposal_creation' }]
          ]
        }
      });

      return 'User info updated successfully';
    } catch (error) {
      console.error('Error updating user info:', error);
      return '❌ Error updating your information. Please try again.';
    }
  }
}