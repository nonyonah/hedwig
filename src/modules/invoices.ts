import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
// Generate invoice number function moved here
function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `INV-${year}${month}${day}-${random}`;
}
import { generateInvoicePDF } from './pdf-generator';
import { sendEmailWithAttachment } from '../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface InvoiceData {
  id?: string;
  user_id: string;
  invoice_number: string;
  freelancer_name: string;
  freelancer_email: string;
  client_name: string;
  client_email: string;
  project_description: string;
  deliverables: string;
  amount: number;
  currency: 'USD' | 'NGN';
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  payment_methods: {
    usdc_base?: string;
    usdc_solana?: string;
    flutterwave?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

export class InvoiceModule {
  private bot: TelegramBot;

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  // Main invoice creation flow
  async handleInvoiceCreation(chatId: number, userId: string, initialMessage?: string) {
    try {
      // Check if user has an ongoing invoice creation
      const ongoingInvoice = await this.getOngoingInvoice(userId);
      
      if (ongoingInvoice) {
        return this.continueInvoiceCreation(chatId, userId, ongoingInvoice, initialMessage);
      }

      // Start new invoice creation
      const invoiceData: Partial<InvoiceData> = {
        user_id: userId,
        invoice_number: generateInvoiceNumber(),
        status: 'draft',
        currency: 'USD',
        payment_methods: {
          usdc_base: '',
          usdc_solana: '',
          flutterwave: true
        }
      };

      // Save initial invoice
      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert([invoiceData])
        .select()
        .single();

      if (error) throw error;

      // Start the creation flow
      await this.bot.sendMessage(chatId, 
        `📋 *Creating New Invoice ${invoice.invoice_number}*\n\n` +
        `Let's gather the invoice details step by step.\n\n` +
        `*Step 1/7:* What's your name (freelancer/service provider)?`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: `cancel_invoice_${invoice.id}` }
            ]]
          }
        }
      );

      // Set user state
      await this.setUserState(userId, 'creating_invoice', {
        invoice_id: invoice.id,
        step: 'freelancer_name'
      });

      return `Invoice creation started for ${invoice.invoice_number}`;
    } catch (error) {
      console.error('Error creating invoice:', error);
      return '❌ Failed to start invoice creation. Please try again.';
    }
  }

  // Continue invoice creation based on current step
  async continueInvoiceCreation(chatId: number, userId: string, invoiceData: any, userInput?: string) {
    try {
      const { invoice_id, step } = invoiceData;
      
      if (!userInput) {
        return this.sendStepPrompt(chatId, step, invoice_id);
      }

      // Process user input based on current step
      const updateData: any = {};
      let nextStep = '';
      let responseMessage = '';

      switch (step) {
        case 'freelancer_name':
          updateData.freelancer_name = userInput.trim();
          nextStep = 'freelancer_email';
          responseMessage = `✅ Freelancer name: ${userInput}\n\n*Step 2/7:* What's your email address?`;
          break;

        case 'freelancer_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address.';
          }
          updateData.freelancer_email = userInput.trim();
          nextStep = 'client_name';
          responseMessage = `✅ Email: ${userInput}\n\n*Step 3/7:* What's your client's name?`;
          break;

        case 'client_name':
          updateData.client_name = userInput.trim();
          nextStep = 'client_email';
          responseMessage = `✅ Client name: ${userInput}\n\n*Step 4/7:* What's your client's email address?`;
          break;

        case 'client_email':
          if (!this.isValidEmail(userInput)) {
            return '❌ Please enter a valid email address.';
          }
          updateData.client_email = userInput.trim();
          nextStep = 'project_description';
          responseMessage = `✅ Client email: ${userInput}\n\n*Step 5/7:* Describe the project/service provided:`;
          break;

        case 'project_description':
          updateData.project_description = userInput.trim();
          nextStep = 'amount';
          responseMessage = `✅ Project description saved\n\n*Step 6/7:* What's the total amount? (e.g., 500 USD or 200000 NGN)`;
          break;

        case 'amount':
          const amountData = this.parseAmount(userInput);
          if (!amountData) {
            return '❌ Please enter a valid amount (e.g., 500 USD or 200000 NGN)';
          }
          updateData.amount = amountData.amount;
          updateData.currency = amountData.currency;
          nextStep = 'due_date';
          responseMessage = `✅ Amount: ${amountData.amount} ${amountData.currency}\n\n*Step 7/7:* When is the payment due? (e.g., 2024-02-15 or "in 30 days")`;
          break;

        case 'due_date':
          const dueDate = this.parseDueDate(userInput);
          if (!dueDate) {
            return '❌ Please enter a valid date (YYYY-MM-DD format or "in X days")';
          }
          updateData.due_date = dueDate;
          nextStep = 'complete';
          break;
      }

      // Update invoice in database
      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoice_id);

      if (error) throw error;

      if (nextStep === 'complete') {
        return this.completeInvoiceCreation(chatId, userId, invoice_id);
      }

      // Update user state and send next prompt
      await this.setUserState(userId, 'creating_invoice', {
        invoice_id,
        step: nextStep
      });

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

  // Complete invoice creation and show preview
  async completeInvoiceCreation(chatId: number, userId: string, invoiceId: string) {
    try {
      // Get complete invoice data
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (error) throw error;

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

      if (!invoice) throw new Error('Invoice not found');

      // Generate PDF
      const pdfBuffer = await generateInvoicePDF(invoice);
      
      // Send email with PDF attachment
      await sendEmailWithAttachment({
        to: invoice.client_email,
        subject: `Invoice ${invoice.invoice_number} from ${invoice.freelancer_name}`,
        html: this.generateEmailTemplate(invoice),
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

      await this.bot.sendMessage(chatId, 
        `✅ Invoice ${invoice.invoice_number} sent successfully to ${invoice.client_email}!`
      );
    } catch (error) {
      console.error('Error sending invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to send invoice. Please try again.');
    }
  }

  // Generate and send PDF to user
  private async generateAndSendPDF(chatId: number, invoiceId: string) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (!invoice) throw new Error('Invoice not found');

      const pdfBuffer = await generateInvoicePDF(invoice);
      
      await this.bot.sendDocument(chatId, pdfBuffer, {
        caption: `📄 Invoice ${invoice.invoice_number} PDF generated successfully!`
      }, {
        filename: `invoice-${invoice.invoice_number}.pdf`
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to generate PDF. Please try again.');
    }
  }

  // Utility functions
  private async getOngoingInvoice(userId: string) {
    const { data } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice')
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
      });
  }

  private async clearUserState(userId: string) {
    await supabase
      .from('user_states')
      .delete()
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice');
  }

  private async sendStepPrompt(chatId: number, step: string, invoiceId: string) {
    const prompts: { [key: string]: string } = {
      'freelancer_name': '*Step 1/7:* What\'s your name (freelancer/service provider)?',
      'freelancer_email': '*Step 2/7:* What\'s your email address?',
      'client_name': '*Step 3/7:* What\'s your client\'s name?',
      'client_email': '*Step 4/7:* What\'s your client\'s email address?',
      'project_description': '*Step 5/7:* Describe the project/service provided:',
      'amount': '*Step 6/7:* What\'s the invoice amount? (e.g., 500 USD or 200000 NGN)',
      'due_date': '*Step 7/7:* When is the payment due? (e.g., "in 30 days" or "2024-02-15")'
    };

    const prompt = prompts[step] || 'Please provide the required information:';
    
    await this.bot.sendMessage(chatId, prompt, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Cancel', callback_data: `cancel_invoice_${invoiceId}` }
        ]]
      }
    });
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

  private parseDueDate(input: string): string | null {
    // Handle "in X days" format
    const daysMatch = input.match(/in\s+(\d+)\s+days?/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      return dueDate.toISOString().split('T')[0];
    }

    // Handle YYYY-MM-DD format
    const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      return input;
    }

    return null;
  }

  private generateEmailTemplate(invoice: InvoiceData): string {
    return `
      <h2>Invoice ${invoice.invoice_number}</h2>
      <p>Dear ${invoice.client_name},</p>
      <p>Please find attached your invoice for the project: ${invoice.project_description}</p>
      <p><strong>Amount Due:</strong> ${invoice.amount} ${invoice.currency}</p>
      <p><strong>Due Date:</strong> ${invoice.due_date}</p>
      <p>You can pay using the following methods:</p>
      <ul>
        <li>USDC on Base Network</li>
        <li>USDC on Solana</li>
        <li>Bank Transfer via Flutterwave</li>
      </ul>
      <p>Payment link: ${process.env.NEXT_PUBLIC_APP_URL}/invoice/${invoice.id}</p>
      <p>Best regards,<br>${invoice.freelancer_name}</p>
    `;
  }

  private async cancelInvoiceCreation(chatId: number, invoiceId: string) {
    try {
      // Delete the draft invoice
      await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('status', 'draft');

      await this.bot.sendMessage(chatId, '❌ Invoice creation cancelled.');
    } catch (error) {
      console.error('Error cancelling invoice:', error);
    }
  }
}