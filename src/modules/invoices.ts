import TelegramBot from 'node-telegram-bot-api';
import { supabase } from '../lib/supabase';
import { sendEmail } from '../lib/emailService';
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
    usdc_solana?: boolean;
    flutterwave?: boolean;
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
      
      // Create new invoice record
      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          status: 'draft',
          currency: 'USD',
          payment_methods: {
            usdc_base: true,
            usdc_solana: true,
            flutterwave: true
          }
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
        action: 'creating_invoice',
        invoice_id: invoice.id,
        step: 'freelancer_name'
      });

      await this.sendStepPrompt(chatId, 'freelancer_name', invoice.id);
    } catch (error) {
      console.error('Error in handleInvoiceCreation:', error);
      await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
  }

  // Continue invoice creation process
  async continueInvoiceCreation(chatId: number, userId: string, userInput: string) {
    try {
      const userState = await this.getUserState(userId);
      if (!userState || userState.action !== 'creating_invoice') {
        return 'No ongoing invoice creation found.';
      }

      const { invoice_id, step } = userState;

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

      switch (step) {
        case 'freelancer_name':
          updateData.freelancer_name = userInput.trim();
          nextStep = 'freelancer_email';
          responseMessage = `✅ Freelancer: ${userInput}\n\n*Step 2/9:* What's your email address?`;
          break;

        case 'freelancer_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address';
          }
          updateData.freelancer_email = userInput.trim();
          nextStep = 'client_name';
          responseMessage = `✅ Email: ${userInput}\n\n*Step 3/9:* What's your client's name?`;
          break;

        case 'client_name':
          updateData.client_name = userInput.trim();
          nextStep = 'client_email';
          responseMessage = `✅ Client: ${userInput}\n\n*Step 4/9:* What's your client's email address?`;
          break;

        case 'client_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address';
          }
          updateData.client_email = userInput.trim();
          nextStep = 'project_description';
          responseMessage = `✅ Client email: ${userInput}\n\n*Step 5/9:* What's the project description?`;
          break;

        case 'project_description':
          updateData.project_description = userInput.trim();
          nextStep = 'quantity';
          responseMessage = `✅ Project: ${userInput}\n\n*Step 6/9:* How many units/hours? (e.g., 1, 5, 10)`;
          break;

        case 'quantity':
          const quantity = parseInt(userInput.trim());
          if (isNaN(quantity) || quantity <= 0) {
            return '❌ Please enter a valid quantity (positive number)';
          }
          updateData.quantity = quantity;
          nextStep = 'rate';
          responseMessage = `✅ Quantity: ${quantity}\n\n*Step 7/9:* What's the rate per unit? (e.g., 100, 50.5)`;
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
          responseMessage = `✅ Rate: ${rateData.amount} ${rateData.currency} per unit\n✅ Total: ${totalAmount} ${rateData.currency}\n\n*Step 8/9:* When is the payment due? (e.g., 2024-02-15 or "in 30 days")`;
          break;

        case 'due_date':
          console.log(`[InvoiceModule] Processing due date input: "${userInput}"`);
          const dueDate = this.parseDueDate(userInput);
          console.log(`[InvoiceModule] Parsed due date result: ${dueDate}`);
          if (!dueDate) {
            return '❌ Please enter a valid date (YYYY-MM-DD format, "X days", or "in X days")';
          }
          updateData.due_date = dueDate;
          nextStep = 'complete';
          responseMessage = `✅ Due date: ${dueDate}\n\n*Step 9/9:* Creating your invoice...`;
          console.log(`[InvoiceModule] Setting nextStep to complete`);
          break;

        default:
          return '❌ Invalid step in invoice creation';
      }

      // Update invoice data
      const { error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoice_id);

      if (updateError) {
        console.error('Error updating invoice:', updateError);
        return '❌ Error saving invoice data. Please try again.';
      }

      // Update user state
      await this.setUserState(userId, {
        action: 'creating_invoice',
        invoice_id,
        step: nextStep
      });

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
    return (
      `📋 *Invoice Preview*\n\n` +
      `*Invoice #:* ${invoice.invoice_number}\n` +
      `*From:* ${invoice.freelancer_name} (${invoice.freelancer_email})\n` +
      `*To:* ${invoice.client_name} (${invoice.client_email})\n` +
      `*Project:* ${invoice.project_description}\n` +
      `*Quantity:* ${invoice.quantity}\n` +
      `*Rate:* ${invoice.rate} ${invoice.currency}\n` +
      `*Amount:* ${invoice.amount} ${invoice.currency}\n` +
      `*Due Date:* ${invoice.due_date}\n` +
      `*Status:* ${invoice.status.toUpperCase()}\n\n` +
      `*Payment Methods Available:*\n` +
      `💰 USDC (Base Network)\n` +
      `💰 USDC (Solana)\n` +
      `💳 Bank Transfer (Flutterwave)\n\n` +
      `What would you like to do next?`
    );
  }

  // Handle callback queries for invoice actions
  async handleInvoiceCallback(callbackQuery: TelegramBot.CallbackQuery) {
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
        await this.cancelInvoiceCreation(chatId, invoiceId);
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
      const emailTemplate = this.generateEmailTemplate(invoice);
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
    await supabase
      .from('user_states')
      .upsert({
        user_id: userId,
        state_type: 'creating_invoice',
        state_data: state,
        updated_at: new Date().toISOString()
      });
  }

  // Get user state
  private async getUserState(userId: string) {
    const { data } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice')
      .maybeSingle();
    
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
        message = '*Step 1/9:* What\'s your name (freelancer)?';
        break;
      case 'freelancer_email':
        message = '*Step 2/9:* What\'s your email address?';
        break;
      case 'client_name':
        message = '*Step 3/9:* What\'s your client\'s name?';
        break;
      case 'client_email':
        message = '*Step 4/9:* What\'s your client\'s email address?';
        break;
      case 'project_description':
        message = '*Step 5/9:* What\'s the project description?';
        break;
      case 'quantity':
        message = '*Step 6/9:* How many units/hours? (e.g., 1, 5, 10)';
        break;
      case 'rate':
        message = '*Step 7/9:* What\'s the rate per unit? (e.g., 100, 50.5)';
        break;
      case 'due_date':
        message = '*Step 8/9:* When is the payment due? (e.g., 2024-02-15 or "in 30 days")';
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

  // Generate email template
  private generateEmailTemplate(invoice: InvoiceData): string {
    return `
      <h2>Invoice ${invoice.invoice_number}</h2>
      <p>Dear ${invoice.client_name},</p>
      <p>Please find attached your invoice for the project: ${invoice.project_description}</p>
      <p><strong>Amount:</strong> ${invoice.amount} ${invoice.currency}</p>
      <p><strong>Due Date:</strong> ${invoice.due_date}</p>
      <p>Thank you for your business!</p>
      <p>Best regards,<br>${invoice.freelancer_name}</p>
    `;
  }

  // Cancel invoice creation
  private async cancelInvoiceCreation(chatId: number, invoiceId: string) {
    try {
      // Delete the invoice
      await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId);

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
        `📝 *Edit Invoice ${invoice.invoice_number}*\n\n` +
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
        `🗑️ *Delete Invoice*\n\n` +
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
}