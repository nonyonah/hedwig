import TelegramBot from 'node-telegram-bot-api';
import { supabase } from '../lib/supabase';
import { sendEmail, generateInvoiceEmailTemplate } from '../lib/emailService';
import { generateInvoicePDF } from './pdf-generator';

export interface InvoiceData {
  id: string;
  invoice_number: string;
  freelancer_name: string;
  freelancer_email: string;
  client_name: string;
  client_email: string;
  project_description: string;
  quantity: number;
  rate: number;
  amount: number;
  currency: string;
  due_date: string;
  status: string;
  payment_methods: {
    usdc_base?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export class InvoiceModule {
  private bot: TelegramBot;

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  // Handle invoice creation command
  async handleInvoiceCreation(chatId: number, userId: string) {
    try {
      // Check if user already has an ongoing invoice creation
      const ongoingInvoice = await this.getOngoingInvoice(userId);
      if (ongoingInvoice) {
        await this.bot.sendMessage(chatId, 
          `You already have an ongoing invoice creation. Please complete it first or cancel it.\n\n` +
          `Invoice #${ongoingInvoice.invoice_number}\n` +
          `Status: ${ongoingInvoice.status}`
        );
        return;
      }

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;
      
      // Get user info and wallet for required fields
      const [userResult, walletResult] = await Promise.all([
        supabase.from('users').select('name, email').eq('id', userId).single(),
        supabase.from('wallets').select('address, chain').eq('user_id', userId).order('created_at', { ascending: true })
      ]);

      const userData = userResult.data;
      const wallets = walletResult.data || [];
      
      // Find the best wallet address (prefer EVM/Base, fallback to any wallet)
      let walletAddress = null;
      if (wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
        walletAddress = evmWallet?.address || wallets[0]?.address;
      }

      // Show personalization with user info and edit option
      const personalizationMessage = 
        `📋 **Invoice from ${userData?.name || 'Unknown User'}**\n\n` +
        `👤 **Your Information:**\n` +
        `Name: ${userData?.name || 'Not set'}\n` +
        `Email: ${userData?.email || 'Not set'}\n\n` +
        `ℹ️ **Note:** A 1% platform fee will be deducted from payments to support our services.\n\n` +
        `Ready to create your professional invoice?`;

      await this.bot.sendMessage(chatId, personalizationMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Edit Info', callback_data: `edit_user_info_${userId}` }],
            [{ text: '✅ Continue', callback_data: `continue_invoice_creation_${userId}` }],
            [{ text: '❌ Cancel', callback_data: 'cancel_invoice_creation' }]
          ]
        }
      });

    } catch (error) {
      console.error('Error in handleInvoiceCreation:', error);
      await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
  }

  // Continue with actual invoice creation after personalization
  async continueInvoiceCreationFlow(chatId: number, userId: string) {
    try {
      // Get user info and wallet for required fields
      const [userResult, walletResult] = await Promise.all([
        supabase.from('users').select('name, email').eq('id', userId).single(),
        supabase.from('wallets').select('address, chain').eq('user_id', userId).order('created_at', { ascending: true })
      ]);

      const userData = userResult.data;
      const wallets = walletResult.data || [];
      
      // Find the best wallet address (prefer EVM/Base, fallback to any wallet)
      let walletAddress = null;
      if (wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
        walletAddress = evmWallet?.address || wallets[0]?.address;
      }

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // Create new invoice record with required fields
      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          freelancer_name: userData?.name || 'Unknown User',
          freelancer_email: userData?.email || 'noreply@hedwigbot.xyz',
          client_name: 'Client',
          client_email: 'client@example.com',
          project_description: 'Project Description',
          quantity: 1,
          rate: 0,
          price: 0,
          amount: 0,
          wallet_address: walletAddress || null,
          status: 'draft',
          currency: 'USD',
          payment_methods: {
            usdc_base: true,
          },
          created_by: userId
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating invoice:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to create invoice. Please try again.');
        return;
      }

      // Set user state for invoice creation
      await this.setUserState(userId, {
        invoice_id: invoice.id,
        step: 'client_name'
      });

      await this.sendStepPrompt(chatId, 'client_name', invoice.id);
    } catch (error) {
      console.error('Error in handleInvoiceCreation:', error);
      await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
  }

  // Continue invoice creation process
  async continueInvoiceCreation(chatId: number, userId: string, userInput: string) {
    try {
      console.log(`[InvoiceModule] continueInvoiceCreation called with userId: ${userId}, input: ${userInput}`);
      
      const userState = await this.getUserState(userId);
      console.log(`[InvoiceModule] Retrieved user state:`, userState);
      
      if (!userState || !userState.invoice_id) {
        console.log(`[InvoiceModule] No ongoing invoice creation found for user ${userId}`);
        return 'No ongoing invoice creation found.';
      }

      const { invoice_id, step } = userState;
      console.log(`[InvoiceModule] Current step: ${step}, invoice_id: ${invoice_id}`);

      // Check if the invoice still exists (defensive programming)
      const { data: existingInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('id')
        .eq('id', invoice_id)
        .single();

      if (invoiceError || !existingInvoice) {
        console.log(`[InvoiceModule] Invoice ${invoice_id} no longer exists, clearing user state`);
        await this.clearUserState(userId);
        await this.bot.sendMessage(chatId, '❌ Your previous invoice was not found. Let\'s start a new one!\n\nType "📄 Invoice" to create a new invoice.');
        return 'Previous invoice not found, state cleared';
      }
      let nextStep = '';
      let responseMessage = '';
      const updateData: any = {};

      // Handle edit states
      if (userState.editing && step.startsWith('edit_')) {
        const editField = step.replace('edit_', '');
        return await this.handleEditInput(chatId, userId, invoice_id, editField, userInput);
      }

      // Handle user info editing states
      if (userState.editing_user_info && step.startsWith('edit_user_')) {
        const field = step.replace('edit_user_', '');
        return await this.handleUserInfoEditInput(chatId, userId, field, userInput);
      }

      switch (step) {
        case 'freelancer_name':
          console.log(`[InvoiceModule] Processing freelancer_name step with input: ${userInput}`);
          updateData.freelancer_name = userInput.trim();
          nextStep = 'freelancer_email';
          responseMessage = `✅ Freelancer: ${userInput}\n\n**Step 2/9:** What's your email address?`;
          break;

        case 'freelancer_email':
          console.log(`[InvoiceModule] Processing freelancer_email step with input: ${userInput}`);
          if (!this.isValidEmail(userInput)) {
            console.log(`[InvoiceModule] Invalid email provided: ${userInput}`);
            return '❌ Please enter a valid email address';
          }
          updateData.freelancer_email = userInput.trim();
          nextStep = 'client_name';
          responseMessage = `✅ Email: ${userInput}\n\n**Step 3/9:** What's your client's name?`;
          break;

        case 'client_name':
          updateData.client_name = userInput.trim();
          nextStep = 'client_email';
          responseMessage = `✅ Client: ${userInput}\n\n**Step 4/9:** What's your client's email address?`;
          break;

        case 'client_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address';
          }
          updateData.client_email = userInput.trim();
          nextStep = 'project_description';
          responseMessage = `✅ Client email: ${userInput}\n\n**Step 5/9:** What's the project description?`;
          break;

        case 'project_description':
          updateData.project_description = userInput.trim();
          nextStep = 'quantity';
          responseMessage = `✅ Project: ${userInput}\n\n**Step 6/9:** How many units/hours? (e.g., 1, 5, 10)`;
          break;

        case 'quantity':
          const quantity = parseInt(userInput.trim());
          if (isNaN(quantity) || quantity <= 0) {
            return '❌ Please enter a valid quantity (positive number)';
          }
          updateData.quantity = quantity;
          nextStep = 'rate';
          responseMessage = `✅ Quantity: ${quantity}\n\n**Step 7/9:** What's the rate per unit? (e.g., 100, 50.5)`;
          break;

        case 'rate':
          const rateData = this.parseAmount(userInput);
          if (!rateData) {
            return '❌ Please enter a valid rate (e.g., 100, 50.5)';
          }
          updateData.rate = rateData.amount;
          updateData.currency = rateData.currency;
          
          // Calculate total amount
          const currentInvoice = await this.getCurrentInvoiceData(invoice_id);
          const totalAmount = (currentInvoice?.quantity || 1) * rateData.amount;
          updateData.amount = totalAmount;
          
          nextStep = 'due_date';
          responseMessage = `✅ Rate: ${rateData.amount} ${rateData.currency} per unit\n✅ Total: ${totalAmount} ${rateData.currency}\n\n**Step 8/10:** When is the payment due? (e.g., 2024-02-15 or "in 30 days")`;
          break;

        case 'due_date':
          console.log(`[InvoiceModule] Processing due date input: "${userInput}"`);
          const dueDate = this.parseDueDate(userInput);
          console.log(`[InvoiceModule] Parsed due date result: ${dueDate}`);
          if (!dueDate) {
            return '❌ Please enter a valid date (YYYY-MM-DD format, "X days", or "in X days")';
          }
          updateData.due_date = dueDate;
          nextStep = 'chain_selection';
          responseMessage = `✅ Due date: ${dueDate}\n\n**Step 9/10:** Which blockchain network would you like to use for payments?\n\n**Currently Supported Networks:** Base and Celo`;
          console.log(`[InvoiceModule] Setting nextStep to chain_selection`);
          break;

        case 'chain_selection':
          console.log(`[InvoiceModule] Processing chain selection input: "${userInput}"`);
          const selectedChain = this.parseChainSelection(userInput);
          if (!selectedChain) {
            return '❌ Please select a valid blockchain network:\n• Type "base" for Base Network\n• Type "celo" for Celo Network';
          }
          updateData.blockchain = selectedChain.network;
          // Note: chain_id will be added when database migration is run
          nextStep = 'complete';
          responseMessage = `✅ Blockchain: ${selectedChain.displayName}\n\n**Step 10/10:** Creating your invoice...**`;
          console.log(`[InvoiceModule] Setting nextStep to complete with blockchain: ${selectedChain.network}`);
          break;

        default:
          return '❌ Invalid step in invoice creation';
      }

      // Update invoice data
      console.log(`[InvoiceModule] Updating invoice ${invoice_id} with data:`, updateData);
      const { error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoice_id);

      if (updateError) {
        console.error('Error updating invoice:', updateError);
        return '❌ Error saving invoice data. Please try again.';
      }
      console.log(`[InvoiceModule] Invoice updated successfully`);

      // Update user state
      console.log(`[InvoiceModule] Updating user state to step: ${nextStep}`);
      await this.setUserState(userId, {
        invoice_id,
        step: nextStep
      });
      console.log(`[InvoiceModule] User state updated successfully`);

      // If complete, finish the invoice creation
      if (nextStep === 'complete') {
        console.log(`[InvoiceModule] Calling completeInvoiceCreation`);
        return await this.completeInvoiceCreation(chatId, userId, invoice_id);
      }

      // Send response with cancel option
      await this.bot.sendMessage(chatId, responseMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: `cancel_invoice_${invoice_id}` }
          ]]
        }
      });

      return 'Invoice creation step completed';
    } catch (error) {
      console.error('Error continuing invoice creation:', error);
      return '❌ Error processing invoice data. Please try again.';
    }
  }

  // Get current invoice data helper method
  private async getCurrentInvoiceData(invoiceId: string) {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();
    
    if (error) {
      console.error('Error fetching current invoice data:', error);
      return null;
    }
    
    return invoice;
  }

  // Complete invoice creation and show preview
  async completeInvoiceCreation(chatId: number, userId: string, invoiceId: string) {
    try {
      console.log(`[InvoiceModule] Completing invoice creation for invoice ID: ${invoiceId}`);
      
      // Get complete invoice data
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (error) {
        console.error(`[InvoiceModule] Error fetching invoice ${invoiceId}:`, error);
        if (error.code === 'PGRST116') {
          await this.bot.sendMessage(chatId, '❌ Invoice not found. Please start a new invoice creation.');
          await this.clearUserState(userId);
          return 'Invoice not found';
        }
        throw error;
      }

      if (!invoice) {
        console.error(`[InvoiceModule] No invoice data returned for ID: ${invoiceId}`);
        await this.bot.sendMessage(chatId, '❌ Invoice data not found. Please start a new invoice creation.');
        await this.clearUserState(userId);
        return 'Invoice data not found';
      }

      // Track invoice_created event for PostHog analytics
      try {
        const { HedwigEvents } = await import('../lib/posthog');
        await HedwigEvents.invoiceCreated(
          userId,
          invoice.id,
          invoice.amount,
          invoice.currency
        );
        console.log('[InvoiceModule] Tracked invoice_created event for invoice:', invoice.id);
      } catch (error) {
        console.error('[InvoiceModule] Error tracking invoice_created event:', error);
      }

      // Award referral points for first invoice creation
      try {
        const { awardActionPoints, awardMilestoneBadges } = await import('../lib/referralService');
        await awardActionPoints(userId, 'first_invoice');
        await awardMilestoneBadges(userId);
        console.log('[InvoiceModule] Referral points awarded for first invoice creation');
      } catch (error) {
        console.error('[InvoiceModule] Error awarding referral points:', error);
      }

      // Clear user state
      await this.clearUserState(userId);

      // Generate preview message
      const previewMessage = this.generateInvoicePreview(invoice);

      await this.bot.sendMessage(chatId, previewMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📧 Send to Client', callback_data: `send_invoice_${invoiceId}` },
              { text: '📄 Generate PDF', callback_data: `pdf_invoice_${invoiceId}` }
            ],
            [
              { text: '✏️ Edit Invoice', callback_data: `edit_invoice_${invoiceId}` },
              { text: '🗑️ Delete', callback_data: `delete_invoice_${invoiceId}` }
            ]
          ]
        }
      });

      return 'Invoice created successfully!';
    } catch (error) {
      console.error('Error completing invoice:', error);
      return '❌ Error completing invoice creation.';
    }
  }

  // Generate invoice preview
  private generateInvoicePreview(invoice: InvoiceData): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const invoiceLink = `${baseUrl}/invoice/${invoice.id}`;
    const platformFee = invoice.amount * 0.01;
    const freelancerReceives = invoice.amount - platformFee;
    
    // Get blockchain display info
    const blockchainInfo = this.getBlockchainDisplayInfo(invoice.blockchain);
    
    return (
      `📋 **Invoice Preview**\n\n` +
      `**Invoice #:** ${invoice.invoice_number}\n` +
      `**From:** ${invoice.freelancer_name} (${invoice.freelancer_email})\n` +
      `**To:** ${invoice.client_name} (${invoice.client_email})\n` +
      `**Project:** ${invoice.project_description}\n` +
      `**Quantity:** ${invoice.quantity}\n` +
      `**Rate:** ${invoice.rate} ${invoice.currency}\n` +
      `**Invoice Amount:** ${invoice.amount} ${invoice.currency}\n` +
      `**Platform Fee (1%):** -${platformFee.toFixed(2)} ${invoice.currency}\n` +
      `**You'll Receive:** ${freelancerReceives.toFixed(2)} ${invoice.currency}\n` +
      `**Due Date:** ${invoice.due_date}\n` +
      `**Blockchain:** ${blockchainInfo.displayName}\n` +
      `**Status:** ${invoice.status.toUpperCase()}\n\n` +
      `ℹ️ **Note:** A 1% platform fee is deducted from payments to support our services.\n\n` +
      `**Payment Methods Available:**\n` +
      `${blockchainInfo.paymentMethods}\n\n` +
      `🔗 **Invoice Link:** ${invoiceLink}\n\n` +
      `What would you like to do next?`
    );
  }

  // Get blockchain display information
  private getBlockchainDisplayInfo(blockchain: string): { displayName: string; paymentMethods: string } {
    switch (blockchain?.toLowerCase()) {
      case 'base':
        return {
          displayName: '🔵 Base Network',
          paymentMethods: '💰 USDC, USDT (Base Network)'
        };
      case 'celo':
        return {
          displayName: '🟢 Celo Network',
          paymentMethods: '💰 cUSD, USDC, USDT (Celo Network)'
        };
      default:
        return {
          displayName: '🔵 Base Network (Default)',
          paymentMethods: '💰 USDC (Base Network)'
        };
    }
  }

  // Handle callback queries for invoice actions
  async handleInvoiceCallback(callbackQuery: TelegramBot.CallbackQuery, userId?: string) {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data;
    
    if (!chatId || !data) return;

    try {
      if (data.startsWith('send_invoice_')) {
        const invoiceId = data.replace('send_invoice_', '');
        await this.sendInvoiceToClient(chatId, invoiceId);
      } else if (data.startsWith('pdf_invoice_')) {
        const invoiceId = data.replace('pdf_invoice_', '');
        await this.generateAndSendPDF(chatId, invoiceId);
      } else if (data.startsWith('edit_invoice_')) {
        const invoiceId = data.replace('edit_invoice_', '');
        await this.editInvoice(chatId, invoiceId);
      } else if (data.startsWith('delete_invoice_')) {
        const invoiceId = data.replace('delete_invoice_', '');
        await this.deleteInvoice(chatId, invoiceId);
      } else if (data.startsWith('cancel_invoice_')) {
        const invoiceId = data.replace('cancel_invoice_', '');
        await this.cancelInvoiceCreation(chatId, invoiceId, userId);
      } else if (data.startsWith('edit_client_')) {
        const invoiceId = data.replace('edit_client_', '');
        await this.handleEditField(chatId, invoiceId, 'client');
      } else if (data.startsWith('edit_project_')) {
        const invoiceId = data.replace('edit_project_', '');
        await this.handleEditField(chatId, invoiceId, 'project');
      } else if (data.startsWith('edit_amount_')) {
        const invoiceId = data.replace('edit_amount_', '');
        await this.handleEditField(chatId, invoiceId, 'amount');
      } else if (data.startsWith('edit_due_date_')) {
        const invoiceId = data.replace('edit_due_date_', '');
        await this.handleEditField(chatId, invoiceId, 'due_date');
      } else if (data.startsWith('confirm_delete_')) {
        const invoiceId = data.replace('confirm_delete_', '');
        await this.confirmDeleteInvoice(chatId, invoiceId);
      } else if (data.startsWith('edit_user_info_')) {
        const userId = data.replace('edit_user_info_', '');
        await this.handleEditUserInfo(chatId, userId);
      } else if (data.startsWith('continue_invoice_creation_')) {
        const userId = data.replace('continue_invoice_creation_', '');
        await this.continueInvoiceCreationFlow(chatId, userId);
      } else if (data === 'cancel_invoice_creation') {
        await this.bot.sendMessage(chatId, '❌ Invoice creation cancelled.');
      } else if (data.startsWith('edit_user_name_')) {
        const userId = data.replace('edit_user_name_', '');
        await this.handleEditUserField(chatId, userId, 'name');
      } else if (data.startsWith('edit_user_email_')) {
        const userId = data.replace('edit_user_email_', '');
        await this.handleEditUserField(chatId, userId, 'email');
      } else if (data.startsWith('edit_user_info_back_')) {
        const userId = data.replace('edit_user_info_back_', '');
        await this.continueInvoiceCreationFlow(chatId, userId);
      }

      await this.bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Error handling invoice callback:', error);
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred' });
    }
  }

  // Send invoice to client via email
  private async sendInvoiceToClient(chatId: number, invoiceId: string) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (!invoice) {
        await this.bot.sendMessage(chatId, '❌ Invoice not found.');
        return;
      }

      // Generate PDF
      const pdfBuffer = await generateInvoicePDF(invoice);
      
      // Send email with PDF attachment
      const emailTemplate = generateInvoiceEmailTemplate(invoice);
      await sendEmail({
        to: invoice.client_email,
        subject: `Invoice ${invoice.invoice_number}`,
        html: emailTemplate,
        attachments: [{
          filename: `invoice-${invoice.invoice_number}.pdf`,
          content: pdfBuffer
        }]
      });

      // Update invoice status
      await supabase
        .from('invoices')
        .update({ status: 'sent' })
        .eq('id', invoiceId);

      // Track invoice sent event
      try {
        const { HedwigEvents } = await import('../lib/posthog');
        await HedwigEvents.invoiceSent(chatId.toString(), {
          invoice_id: invoiceId,
          client_email: invoice.client_email,
          amount: invoice.amount,
          currency: invoice.currency
        });
        console.log('PostHog: Invoice sent event tracked successfully');
      } catch (trackingError) {
        console.error('PostHog tracking error for invoice_sent:', trackingError);
      }

      await this.bot.sendMessage(chatId, `✅ Invoice sent to ${invoice.client_email}`);
    } catch (error) {
      console.error('Error sending invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to send invoice. Please try again.');
    }
  }

  // Generate and send PDF
  private async generateAndSendPDF(chatId: number, invoiceId: string) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (!invoice) {
        await this.bot.sendMessage(chatId, '❌ Invoice not found.');
        return;
      }

      const pdfBuffer = await generateInvoicePDF(invoice);
      
      await this.bot.sendDocument(chatId, pdfBuffer, {
        caption: `📄 Invoice #${invoice.invoice_number}`
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to generate PDF. Please try again.');
    }
  }

  // Get ongoing invoice for user
  private async getOngoingInvoice(userId: string) {
    const { data: userState } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice')
      .maybeSingle();

    if (!userState?.state_data) return null;

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', userState.state_data.invoice_id)
      .single();

    return invoice;
  }

  // Set user state
  private async setUserState(userId: string, state: any) {
    console.log(`[InvoiceModule] setUserState called with userId: ${userId}, state:`, state);
    const result = await supabase
      .from('user_states')
      .upsert({
        user_id: userId,
        state_type: 'creating_invoice',
        state_data: state,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,state_type'
      });
    
    console.log(`[InvoiceModule] setUserState result:`, result);
    if (result.error) {
      console.error(`[InvoiceModule] Error in setUserState:`, result.error);
    }
  }

  // Get user state
  private async getUserState(userId: string) {
    console.log(`[InvoiceModule] getUserState called with userId: ${userId}`);
    const { data, error } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice')
      .maybeSingle();
    
    console.log(`[InvoiceModule] getUserState result - data:`, data);
    console.log(`[InvoiceModule] getUserState result - error:`, error);
    
    return data?.state_data;
  }

  // Clear user state
  private async clearUserState(userId: string) {
    await supabase
      .from('user_states')
      .delete()
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice');
  }

  // Send step prompt
  private async sendStepPrompt(chatId: number, step: string, invoiceId: string) {
    let message = '';
    
    switch (step) {
      case 'freelancer_name':
        message = '📋 **Creating Professional Invoice**\n\n' +
        'ℹ️ **Note:** A 1% platform fee will be deducted from payments to support our services.\n\n' +
        '**Step 1/9:** What\'s your name (freelancer)?';
        break;
      case 'freelancer_email':
        message = '**Step 2/9:** What\'s your email address?';
        break;
      case 'client_name':
        message = '**Step 3/9:** What\'s your client\'s name?';
        break;
      case 'client_email':
        message = '**Step 4/9:** What\'s your client\'s email address?';
        break;
      case 'project_description':
        message = '**Step 5/9:** What\'s the project description?';
        break;
      case 'quantity':
        message = '**Step 6/9:** How many units/hours? (e.g., 1, 5, 10)';
        break;
      case 'rate':
        message = '**Step 7/9:** What\'s the rate per unit? (e.g., 100, 50.5)';
        break;
      case 'due_date':
        message = '**Step 8/10:** When is the payment due? (e.g., 2024-02-15 or "in 30 days")';
        break;
      case 'chain_selection':
        message = '**Step 9/10:** Which blockchain network would you like to use for payments?\n\n' +
          '**Currently Supported Networks:**\n\n' +
          '🔵 **Base Network** - Type "base"\n' +
          '• Lower fees, faster transactions\n' +
          '• Supports USDC, USDT\n' +
          '• Recommended for most users\n\n' +
          '🟢 **Celo Network** - Type "celo"\n' +
          '• Mobile-friendly payments\n' +
          '• Supports cUSD, USDC, USDT\n' +
          '• Great for mobile users\n\n' +
          '💡 **Please type "base" or "celo" to continue:**';
        break;
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Cancel', callback_data: `cancel_invoice_${invoiceId}` }
        ]]
      }
    });
  }

  // Handle edit user info
  private async handleEditUserInfo(chatId: number, userId: string) {
    try {
      // First check if userId is a valid UUID, if not, get proper user ID
      let actualUserId = userId;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        // userId is likely a Telegram chat ID, get proper user ID
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (!user?.id) {
          // Create user if doesn't exist
          const { data: newUserId, error } = await supabase.rpc('get_or_create_telegram_user', {
            p_telegram_chat_id: parseInt(userId),
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

      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', actualUserId)
        .single();

      const message = 
        `✏️ **Edit Your Information**\n\n` +
      `👤 **Current Information:**\n` +
        `Name: ${userData?.name || 'Not set'}\n` +
        `Email: ${userData?.email || 'Not set'}\n\n` +
        `What would you like to edit?`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Edit Name', callback_data: `edit_user_name_${actualUserId}` }],
            [{ text: '📧 Edit Email', callback_data: `edit_user_email_${actualUserId}` }],
            [{ text: '🔙 Back', callback_data: `edit_user_info_back_${actualUserId}` }]
          ]
        }
      });
    } catch (error) {
      console.error('Error handling edit user info:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading user information.');
    }
  }

  // Handle edit user field
  private async handleEditUserField(chatId: number, userId: string, field: string) {
    try {
      // First check if userId is a valid UUID, if not, get proper user ID
      let actualUserId = userId;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        // userId is likely a Telegram chat ID, get proper user ID
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (!user?.id) {
          // Create user if doesn't exist
          const { data: newUserId, error } = await supabase.rpc('get_or_create_telegram_user', {
            p_telegram_chat_id: parseInt(userId),
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

      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', actualUserId)
        .single();

      let message = '';
      if (field === 'name') {
        message = 
          `📝 **Edit Name**\n\n` +
          `Current name: ${userData?.name || 'Not set'}\n\n` +
          `Please send your new name:`;
      } else if (field === 'email') {
        message = 
          `📧 **Edit Email**\n\n` +
          `Current email: ${userData?.email || 'Not set'}\n\n` +
          `Please send your new email address:`;
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: `edit_user_info_${actualUserId}` }
          ]]
        }
      });

      // Set user state for editing
      await this.setUserState(actualUserId, {
        step: `edit_user_${field}`,
        editing_user_info: true
      });
    } catch (error) {
      console.error('Error handling edit user field:', error);
      await this.bot.sendMessage(chatId, '❌ Error processing request.');
    }
  }

  // Handle user info edit input
  public async handleUserInfoEditInput(chatId: number, userId: string, field: string, userInput: string) {
    try {
      const updateData: any = {};
      let message = '';

      if (field === 'name') {
        updateData.name = userInput.trim();
        message = `✅ Name updated to: ${userInput.trim()}`;
      } else if (field === 'email') {
        if (!this.isValidEmail(userInput)) {
          return '❌ Please enter a valid email address';
        }
        updateData.email = userInput.trim();
        message = `✅ Email updated to: ${userInput.trim()}`;
      }

      // Update user data
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        console.error('Error updating user info:', error);
        return '❌ Error updating information. Please try again.';
      }

      // Clear user state
      await this.clearUserState(userId);

      // Show updated info and continue with invoice creation
      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .single();

      const updatedMessage = 
        `${message}\n\n` +
        `📋 **Updated Information:**\n` +
        `Name: ${userData?.name || 'Not set'}\n` +
        `Email: ${userData?.email || 'Not set'}\n\n` +
        `Ready to create your invoice?`;

      await this.bot.sendMessage(chatId, updatedMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Continue', callback_data: `continue_invoice_creation_${userId}` }],
            [{ text: '✏️ Edit More', callback_data: `edit_user_info_${userId}` }],
            [{ text: '❌ Cancel', callback_data: 'cancel_invoice_creation' }]
          ]
        }
      });

      return 'User info updated successfully';
    } catch (error) {
      console.error('Error handling user info edit input:', error);
      return '❌ Error processing update. Please try again.';
    }
  }

  // Validate email
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Parse amount with currency
  private parseAmount(input: string): { amount: number; currency: string } | null {
    const cleanInput = input.trim().replace(/,/g, '');
    const match = cleanInput.match(/^([0-9]+\.?[0-9]*)\s*([A-Z]{3})?$/i);
    
    if (!match) return null;
    
    const amount = parseFloat(match[1]);
    const currency = match[2]?.toUpperCase() || 'USD';
    
    return { amount, currency };
  }

  // Parse due date
  private parseDueDate(input: string): string | null {
    const cleanInput = input.trim().toLowerCase();
    
    // Check for "X days" or "in X days" format
    const daysMatch = cleanInput.match(/^(?:in\s+)?(\d+)\s+days?$/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      return futureDate.toISOString().split('T')[0];
    }
    
    // Check for YYYY-MM-DD format
    const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const date = new Date(input);
      if (!isNaN(date.getTime())) {
        return input;
      }
    }
    
    return null;
  }

  // Parse chain selection from user input
  private parseChainSelection(input: string): { network: string; chainId: number; displayName: string } | null {
    const trimmed = input.trim().toLowerCase();
    
    // Base network variations
    if (trimmed.includes('base') || trimmed === '1' || trimmed === 'base network' || 
        trimmed === 'b' || trimmed === '🔵') {
      return {
        network: 'base',
        chainId: 8453,
        displayName: 'Base Network'
      };
    }
    
    // Celo network variations
    if (trimmed.includes('celo') || trimmed === '2' || trimmed === 'celo network' || 
        trimmed === 'c' || trimmed === '🟢') {
      return {
        network: 'celo',
        chainId: 42220,
        displayName: 'Celo Network'
      };
    }
    
    return null;
  }



  // Cancel invoice creation
  async cancelInvoiceCreation(chatId: number, invoiceId: string, userId?: string) {
    try {
      // Delete the invoice
      await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId);

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

      await this.bot.sendMessage(chatId, '❌ Invoice creation cancelled.');
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to cancel invoice.');
    }
  }

  // Edit invoice
  private async editInvoice(chatId: number, invoiceId: string) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (!invoice) {
        await this.bot.sendMessage(chatId, '❌ Invoice not found.');
        return;
      }

      await this.bot.sendMessage(chatId, 
        `📝 **Edit Invoice ${invoice.invoice_number}**\n\n` +
        `Current details:\n` +
        `• Freelancer: ${invoice.freelancer_name}\n` +
        `• Client: ${invoice.client_name}\n` +
        `• Project: ${invoice.project_description}\n` +
        `• Amount: ${invoice.amount} ${invoice.currency}\n` +
        `• Due Date: ${invoice.due_date}\n\n` +
        `What would you like to edit?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Client Info', callback_data: `edit_client_${invoiceId}` }],
              [{ text: '📋 Project Details', callback_data: `edit_project_${invoiceId}` }],
              [{ text: '💰 Amount', callback_data: `edit_amount_${invoiceId}` }],
              [{ text: '📅 Due Date', callback_data: `edit_due_date_${invoiceId}` }],
              [{ text: '❌ Cancel', callback_data: `view_invoice_${invoiceId}` }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error editing invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to edit invoice. Please try again.');
    }
  }

  // Delete invoice
  private async deleteInvoice(chatId: number, invoiceId: string) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('id', invoiceId)
        .single();

      if (!invoice) {
        await this.bot.sendMessage(chatId, '❌ Invoice not found.');
        return;
      }

      await this.bot.sendMessage(chatId, 
        `🗑️ **Delete Invoice**\n\n` +
        `Are you sure you want to delete Invoice ${invoice.invoice_number}?\n` +
        `This action cannot be undone.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, Delete', callback_data: `confirm_delete_${invoiceId}` }],
              [{ text: '❌ Cancel', callback_data: `view_invoice_${invoiceId}` }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error deleting invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to delete invoice. Please try again.');
    }
  }

  // Confirm delete invoice
  private async confirmDeleteInvoice(chatId: number, invoiceId: string) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('id', invoiceId)
        .single();

      if (!invoice) {
        await this.bot.sendMessage(chatId, '❌ Invoice not found.');
        return;
      }

      // Delete the invoice
      await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId);

      await this.bot.sendMessage(chatId, `✅ Invoice ${invoice.invoice_number} has been deleted.`);
    } catch (error) {
      console.error('Error confirming delete invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to delete invoice. Please try again.');
    }
  }

  // Handle edit field
  private async handleEditField(chatId: number, invoiceId: string, field: string) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (!invoice) {
        await this.bot.sendMessage(chatId, '❌ Invoice not found.');
        return;
      }

      let message = '';
      switch (field) {
        case 'client':
          message = `📝 **Edit Client Information**\n\n` +
                   `Current client: ${invoice.client_name} (${invoice.client_email})\n\n` +
                   `Please send the new client name:`;
          break;
        case 'project':
          message = `📝 **Edit Project Details**\n\n` +
                   `Current project: ${invoice.project_description}\n` +
                   `Current quantity: ${invoice.quantity}\n` +
                   `Current rate: ${invoice.rate}\n\n` +
                   `Please send the new project description:`;
          break;
        case 'amount':
          message = `📝 **Edit Amount**\n\n` +
                   `Current amount: ${invoice.amount} ${invoice.currency}\n\n` +
                   `Please send the new amount (e.g., 100 USD):`;
          break;
        case 'due_date':
          message = `📝 **Edit Due Date**\n\n` +
                   `Current due date: ${invoice.due_date}\n\n` +
                   `Please send the new due date (e.g., 2024-02-15 or "in 30 days"):`;
          break;
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: `edit_invoice_${invoiceId}` }
          ]]
        }
      });

      // Set user state for editing
      const userId = await this.getUserIdByChatId(chatId);
      await this.setUserState(userId, {
        invoice_id: invoiceId,
        step: `edit_${field}`,
        editing: true
      });

    } catch (error) {
      console.error('Error handling edit field:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to edit field. Please try again.');
    }
  }

  // Helper function to get user UUID by chat ID
  private async getUserIdByChatId(chatId: number): Promise<string> {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .single();
    
    return data?.id || chatId.toString(); // Fallback to chatId if not found
  }

  // Handle edit input
  private async handleEditInput(chatId: number, userId: string, invoiceId: string, field: string, userInput: string) {
    try {
      const updateData: any = {};
      let responseMessage = '';

      switch (field) {
        case 'client':
          updateData.client_name = userInput.trim();
          responseMessage = `✅ Client name updated to: ${userInput}`;
          break;
        case 'project':
          updateData.project_description = userInput.trim();
          responseMessage = `✅ Project description updated to: ${userInput}`;
          break;
        case 'amount':
          const amountData = this.parseAmount(userInput);
          if (!amountData) {
            return '❌ Please enter a valid amount (e.g., 100 USD)';
          }
          updateData.amount = amountData.amount;
          updateData.currency = amountData.currency;
          responseMessage = `✅ Amount updated to: ${amountData.amount} ${amountData.currency}`;
          break;
        case 'due_date':
          const dueDate = this.parseDueDate(userInput);
          if (!dueDate) {
            return '❌ Please enter a valid date (YYYY-MM-DD format, "X days", or "in X days")';
          }
          updateData.due_date = dueDate;
          responseMessage = `✅ Due date updated to: ${dueDate}`;
          break;
        default:
          return '❌ Invalid edit field';
      }

      // Update invoice data
      const { error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (updateError) {
        console.error('Error updating invoice:', updateError);
        return '❌ Error saving changes. Please try again.';
      }

      // Clear edit state
      await this.clearUserState(userId);

      // Send success message and return to edit menu
      await this.bot.sendMessage(chatId, responseMessage);
      await this.editInvoice(chatId, invoiceId);

      return 'Edit completed successfully';
    } catch (error) {
      console.error('Error handling edit input:', error);
      return '❌ Error processing edit. Please try again.';
    }
  }
}