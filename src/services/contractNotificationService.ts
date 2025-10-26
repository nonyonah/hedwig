import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ContractNotificationData {
  contractId: string;
  freelancerId: string;
  clientEmail: string;
  clientName?: string;
  contractTitle: string;
  contractDescription?: string;
  totalAmount: number;
  currency: string;
  milestones?: Array<{
    id: string;
    title: string;
    amount: number;
    due_date: string;
  }>;
  approvalToken?: string;
  declineReason?: string;
  paymentAmount?: number;
  itemName?: string;
  itemType?: 'milestone' | 'payment';
}

export class ContractNotificationService {
  
  /**
   * Send contract creation notification to client (approval email)
   */
  async sendContractCreationNotification(data: ContractNotificationData): Promise<void> {
    try {
      const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/contracts/approve?token=${data.approvalToken}`;
      const declineUrl = `${process.env.NEXT_PUBLIC_APP_URL}/contracts/decline?token=${data.approvalToken}`;
      
      const emailTemplate = this.generateContractApprovalEmailTemplate(data, approvalUrl, declineUrl);
      
      await sendSimpleEmail(
        data.clientEmail,
        `📋 Contract Approval Required: ${data.contractTitle}`,
        emailTemplate
      );

      // Create notification record
      await this.createNotificationRecord({
        contract_id: data.contractId,
        recipient: 'client',
        notification_type: 'contract_created',
        subject: `Contract Approval Required: ${data.contractTitle}`,
        message: `A new contract "${data.contractTitle}" has been created and requires your approval`,
        sent_via_email: true,
        sent_via_telegram: false
      });

      console.log(`[ContractNotification] Contract creation notification sent to ${data.clientEmail}`);
    } catch (error) {
      console.error('[ContractNotification] Error sending contract creation notification:', error);
      throw error;
    }
  }

  /**
   * Send contract approval notification to freelancer
   */
  async sendContractApprovalNotification(data: ContractNotificationData): Promise<void> {
    try {
      // Get freelancer details
      const { data: freelancer } = await supabase
        .from('users')
        .select('email, telegram_chat_id, first_name, last_name')
        .eq('id', data.freelancerId)
        .single();

      if (!freelancer) {
        throw new Error('Freelancer not found');
      }

      // Send email notification
      if (freelancer.email) {
        const emailTemplate = this.generateContractApprovalNotificationEmailTemplate(data, freelancer);
        await sendSimpleEmail(
          freelancer.email,
          `🎉 Contract Approved: ${data.contractTitle}`,
          emailTemplate
        );
      }

      // Send Telegram notification
      if (freelancer.telegram_chat_id) {
        await this.sendTelegramNotification(
          freelancer.telegram_chat_id,
          this.generateContractApprovalTelegramMessage(data, freelancer)
        );
      }

      // Create notification records
      await this.createNotificationRecord({
        contract_id: data.contractId,
        recipient: 'freelancer',
        notification_type: 'contract_approved',
        subject: `Contract Approved: ${data.contractTitle}`,
        message: `Your contract "${data.contractTitle}" has been approved by the client`,
        sent_via_email: !!freelancer.email,
        sent_via_telegram: !!freelancer.telegram_chat_id
      });

      console.log(`[ContractNotification] Contract approval notification sent to freelancer ${data.freelancerId}`);
    } catch (error) {
      console.error('[ContractNotification] Error sending contract approval notification:', error);
      throw error;
    }
  }

  /**
   * Send contract decline notification to freelancer
   */
  async sendContractDeclineNotification(data: ContractNotificationData): Promise<void> {
    try {
      // Get freelancer details
      const { data: freelancer } = await supabase
        .from('users')
        .select('email, telegram_chat_id, first_name, last_name')
        .eq('id', data.freelancerId)
        .single();

      if (!freelancer) {
        throw new Error('Freelancer not found');
      }

      // Send email notification
      if (freelancer.email) {
        const emailTemplate = this.generateContractDeclineNotificationEmailTemplate(data, freelancer);
        await sendSimpleEmail(
          freelancer.email,
          `❌ Contract Declined: ${data.contractTitle}`,
          emailTemplate
        );
      }

      // Send Telegram notification
      if (freelancer.telegram_chat_id) {
        await this.sendTelegramNotification(
          freelancer.telegram_chat_id,
          this.generateContractDeclineTelegramMessage(data, freelancer)
        );
      }

      // Create notification records
      await this.createNotificationRecord({
        contract_id: data.contractId,
        recipient: 'freelancer',
        notification_type: 'contract_declined',
        subject: `Contract Declined: ${data.contractTitle}`,
        message: `Your contract "${data.contractTitle}" has been declined by the client`,
        sent_via_email: !!freelancer.email,
        sent_via_telegram: !!freelancer.telegram_chat_id
      });

      console.log(`[ContractNotification] Contract decline notification sent to freelancer ${data.freelancerId}`);
    } catch (error) {
      console.error('[ContractNotification] Error sending contract decline notification:', error);
      throw error;
    }
  }

  /**
   * Send payment received notification
   */
  async sendPaymentReceivedNotification(data: ContractNotificationData): Promise<void> {
    try {
      // Get freelancer details
      const { data: freelancer } = await supabase
        .from('users')
        .select('email, telegram_chat_id, first_name, last_name')
        .eq('id', data.freelancerId)
        .single();

      if (!freelancer) {
        throw new Error('Freelancer not found');
      }

      // Send email notification to freelancer
      if (freelancer.email) {
        const emailTemplate = this.generatePaymentReceivedEmailTemplate(data, freelancer);
        await sendSimpleEmail(
          freelancer.email,
          `💰 Payment Received: ${data.contractTitle}`,
          emailTemplate
        );
      }

      // Send Telegram notification to freelancer
      if (freelancer.telegram_chat_id) {
        await this.sendTelegramNotification(
          freelancer.telegram_chat_id,
          this.generatePaymentReceivedTelegramMessage(data, freelancer)
        );
      }

      // Create notification records
      await this.createNotificationRecord({
        contract_id: data.contractId,
        recipient: 'freelancer',
        notification_type: 'payment_received',
        subject: `Payment Received: ${data.paymentAmount} ${data.currency}`,
        message: `You received a payment of ${data.paymentAmount} ${data.currency} for ${data.itemName} in contract "${data.contractTitle}"`,
        sent_via_email: !!freelancer.email,
        sent_via_telegram: !!freelancer.telegram_chat_id
      });

      await this.createNotificationRecord({
        contract_id: data.contractId,
        recipient: 'client',
        notification_type: 'payment_confirmed',
        subject: `Payment Confirmed: ${data.paymentAmount} ${data.currency}`,
        message: `Your payment of ${data.paymentAmount} ${data.currency} for ${data.itemName} has been confirmed`,
        sent_via_email: false,
        sent_via_telegram: false
      });

      console.log(`[ContractNotification] Payment received notification sent for contract ${data.contractId}`);
    } catch (error) {
      console.error('[ContractNotification] Error sending payment received notification:', error);
      throw error;
    }
  }

  /**
   * Send contract completion notification
   */
  async sendContractCompletionNotification(data: ContractNotificationData): Promise<void> {
    try {
      // Get freelancer details
      const { data: freelancer } = await supabase
        .from('users')
        .select('email, telegram_chat_id, first_name, last_name')
        .eq('id', data.freelancerId)
        .single();

      if (!freelancer) {
        throw new Error('Freelancer not found');
      }

      // Send email notification to freelancer
      if (freelancer.email) {
        const emailTemplate = this.generateContractCompletionEmailTemplate(data, freelancer);
        await sendSimpleEmail(
          freelancer.email,
          `🎉 Contract Completed: ${data.contractTitle}`,
          emailTemplate
        );
      }

      // Send Telegram notification to freelancer
      if (freelancer.telegram_chat_id) {
        await this.sendTelegramNotification(
          freelancer.telegram_chat_id,
          this.generateContractCompletionTelegramMessage(data, freelancer)
        );
      }

      // Create notification records
      await this.createNotificationRecord({
        contract_id: data.contractId,
        recipient: 'freelancer',
        notification_type: 'contract_completed',
        subject: `Contract Completed: ${data.contractTitle}`,
        message: `Your contract "${data.contractTitle}" has been completed! All payments have been received.`,
        sent_via_email: !!freelancer.email,
        sent_via_telegram: !!freelancer.telegram_chat_id
      });

      await this.createNotificationRecord({
        contract_id: data.contractId,
        recipient: 'client',
        notification_type: 'contract_completed',
        subject: `Contract Completed: ${data.contractTitle}`,
        message: `The contract "${data.contractTitle}" has been completed successfully.`,
        sent_via_email: false,
        sent_via_telegram: false
      });

      console.log(`[ContractNotification] Contract completion notification sent for contract ${data.contractId}`);
    } catch (error) {
      console.error('[ContractNotification] Error sending contract completion notification:', error);
      throw error;
    }
  }

  /**
   * Send Telegram notification
   */
  private async sendTelegramNotification(chatId: string, message: string): Promise<void> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[ContractNotification] Error sending Telegram notification:', error);
      throw error;
    }
  }

  /**
   * Create notification record in database
   */
  private async createNotificationRecord(notification: {
    contract_id: string;
    recipient: 'freelancer' | 'client';
    notification_type: string;
    subject: string;
    message: string;
    sent_via_email: boolean;
    sent_via_telegram: boolean;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('contract_notifications')
        .insert(notification);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('[ContractNotification] Error creating notification record:', error);
      throw error;
    }
  }

  // Email Templates

  private generateContractApprovalEmailTemplate(data: ContractNotificationData, approvalUrl: string, declineUrl: string): string {
    const milestonesHtml = data.milestones?.map(milestone => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${milestone.title}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${milestone.amount} ${data.currency}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${new Date(milestone.due_date).toLocaleDateString()}</td>
      </tr>
    `).join('') || '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contract Approval Required</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .button { display: inline-block; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 10px 5px; }
          .approve-btn { background: #10b981; }
          .decline-btn { background: #ef4444; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 24px; font-weight: bold; color: #3b82f6; }
          .contract-emoji { font-size: 48px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: bold; }
          .button-container { text-align: center; margin: 30px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="contract-emoji">📋</div>
            <h1>Contract Approval Required</h1>
            <p>A new contract has been created for your review</p>
          </div>
          
          <div class="content">
            <h2>Contract Details</h2>
            <p><strong>Project:</strong> ${data.contractTitle}</p>
            ${data.contractDescription ? `<p><strong>Description:</strong> ${data.contractDescription}</p>` : ''}
            <p><strong>Total Amount:</strong> <span class="amount">${data.totalAmount} ${data.currency}</span></p>
            
            ${data.milestones && data.milestones.length > 0 ? `
              <h3>Milestones</h3>
              <table>
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${milestonesHtml}
                </tbody>
              </table>
            ` : ''}
            
            <div class="button-container">
              <a href="${approvalUrl}" class="button approve-btn">✅ Approve Contract</a>
              <a href="${declineUrl}" class="button decline-btn">❌ Decline Contract</a>
            </div>
            
            <p><em>Please review the contract details carefully before making your decision. Once approved, invoices will be automatically generated for each milestone.</em></p>
          </div>
          
          <div class="footer">
            <p>This email was sent by Hedwig. If you have any questions, please contact support.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateContractApprovalNotificationEmailTemplate(data: ContractNotificationData, freelancer: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contract Approved!</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 24px; font-weight: bold; color: #10b981; }
          .celebration { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="celebration">🎉</div>
            <h1>Contract Approved!</h1>
            <p>Great news! Your contract has been approved by the client.</p>
          </div>
          
          <div class="content">
            <p>Hello ${freelancer.first_name || 'there'},</p>
            
            <p>Congratulations! Your contract "<strong>${data.contractTitle}</strong>" has been approved by the client.</p>
            
            <p><strong>Contract Value:</strong> <span class="amount">${data.totalAmount} ${data.currency}</span></p>
            
            <p><strong>What happens next:</strong></p>
            <ul>
              <li>✅ Invoices have been automatically generated for each milestone</li>
              <li>💰 You'll receive payments as the client completes each milestone payment</li>
              <li>📧 You'll get notifications for all payment activities</li>
              <li>🎯 Focus on delivering excellent work!</li>
            </ul>
            
            <p>You can track the progress of your contract and payments through your Hedwig dashboard.</p>
            
            <p>Best of luck with your project!</p>
          </div>
          
          <div class="footer">
            <p>This email was sent by Hedwig. Keep up the great work!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateContractDeclineNotificationEmailTemplate(data: ContractNotificationData, freelancer: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contract Declined</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .reason-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .sad-emoji { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="sad-emoji">😔</div>
            <h1>Contract Declined</h1>
            <p>Unfortunately, your contract was not approved.</p>
          </div>
          
          <div class="content">
            <p>Hello ${freelancer.first_name || 'there'},</p>
            
            <p>We're sorry to inform you that your contract "<strong>${data.contractTitle}</strong>" has been declined by the client.</p>
            
            ${data.declineReason ? `
              <div class="reason-box">
                <strong>Reason provided:</strong><br>
                ${data.declineReason}
              </div>
            ` : ''}
            
            <p><strong>What you can do next:</strong></p>
            <ul>
              <li>📞 Reach out to the client to discuss their concerns</li>
              <li>📝 Consider revising your proposal based on their feedback</li>
              <li>🔄 Create a new contract with updated terms if appropriate</li>
              <li>🎯 Keep pursuing other opportunities</li>
            </ul>
            
            <p>Don't let this discourage you! Every "no" brings you closer to the right "yes".</p>
          </div>
          
          <div class="footer">
            <p>This email was sent by Hedwig. Keep pushing forward!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generatePaymentReceivedEmailTemplate(data: ContractNotificationData, freelancer: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Received!</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 32px; font-weight: bold; color: #10b981; text-align: center; margin: 20px 0; }
          .money-emoji { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="money-emoji">💰</div>
            <h1>Payment Received!</h1>
            <p>You've received a payment for your work.</p>
          </div>
          
          <div class="content">
            <p>Hello ${freelancer.first_name || 'there'},</p>
            
            <p>Great news! You've received a payment for your contract "<strong>${data.contractTitle}</strong>".</p>
            
            <div class="amount">${data.paymentAmount} ${data.currency}</div>
            
            <p><strong>Payment Details:</strong></p>
            <ul>
              <li><strong>For:</strong> ${data.itemName}</li>
              <li><strong>Contract:</strong> ${data.contractTitle}</li>
              <li><strong>Amount:</strong> ${data.paymentAmount} ${data.currency}</li>
              <li><strong>Type:</strong> ${data.itemType === 'milestone' ? 'Milestone Payment' : 'Payment'}</li>
            </ul>
            
            <p>The payment has been processed and should be available in your wallet shortly.</p>
            
            <p>Keep up the excellent work!</p>
          </div>
          
          <div class="footer">
            <p>This email was sent by Hedwig. Thank you for using our platform!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateContractCompletionEmailTemplate(data: ContractNotificationData, freelancer: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contract Completed!</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 24px; font-weight: bold; color: #8b5cf6; }
          .celebration { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="celebration">🎉</div>
            <h1>Contract Completed!</h1>
            <p>Congratulations! Your contract has been fully completed.</p>
          </div>
          
          <div class="content">
            <p>Hello ${freelancer.first_name || 'there'},</p>
            
            <p>🎊 Fantastic news! Your contract "<strong>${data.contractTitle}</strong>" has been completed successfully!</p>
            
            <p><strong>Final Contract Summary:</strong></p>
            <ul>
              <li><strong>Total Value:</strong> <span class="amount">${data.totalAmount} ${data.currency}</span></li>
              <li><strong>Status:</strong> ✅ Fully Paid & Completed</li>
              <li><strong>All Milestones:</strong> ✅ Completed</li>
            </ul>
            
            <p><strong>What this means:</strong></p>
            <ul>
              <li>🎯 All project deliverables have been completed</li>
              <li>💰 All payments have been received</li>
              <li>✨ The contract is now closed</li>
              <li>🏆 Another successful project in your portfolio!</li>
            </ul>
            
            <p>Thank you for your excellent work and professionalism. We hope to see you on many more successful projects!</p>
            
            <p>Congratulations once again! 🎉</p>
          </div>
          
          <div class="footer">
            <p>This email was sent by Hedwig. Celebrating your success!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Telegram Message Templates

  private generateContractApprovalTelegramMessage(data: ContractNotificationData, freelancer: any): string {
    return `🎉 *Contract Approved!*

Hello ${freelancer.first_name || 'there'}! Great news!

📋 *Contract:* "${data.contractTitle}"
💰 *Value:* ${data.totalAmount} ${data.currency}
✅ *Status:* Approved by client

*What's next:*
• Invoices have been auto-generated
• You'll get payment notifications
• Focus on delivering great work!

Keep up the excellent work! 🚀`;
  }

  private generateContractDeclineTelegramMessage(data: ContractNotificationData, freelancer: any): string {
    return `😔 *Contract Declined*

Hello ${freelancer.first_name || 'there'},

Unfortunately, your contract "${data.contractTitle}" was declined by the client.

${data.declineReason ? `*Reason:* ${data.declineReason}` : ''}

*Don't give up!*
• Reach out to discuss concerns
• Consider revising your proposal
• Keep pursuing other opportunities

Every "no" brings you closer to the right "yes"! 💪`;
  }

  private generatePaymentReceivedTelegramMessage(data: ContractNotificationData, freelancer: any): string {
    return `💰 *Payment Received!*

Hello ${freelancer.first_name || 'there'}!

You've received a payment! 🎉

💵 *Amount:* ${data.paymentAmount} ${data.currency}
📋 *For:* ${data.itemName}
🏗️ *Contract:* "${data.contractTitle}"

The payment is now available in your wallet.

Keep up the great work! 🚀`;
  }

  private generateContractCompletionTelegramMessage(data: ContractNotificationData, freelancer: any): string {
    return `🎉 *Contract Completed!*

Congratulations ${freelancer.first_name || 'there'}! 

📋 *Contract:* "${data.contractTitle}"
💰 *Total Value:* ${data.totalAmount} ${data.currency}
✅ *Status:* Fully Completed & Paid

All milestones completed! 🏆
Another successful project in your portfolio!

Well done! 🎊`;
  }
}

// Export singleton instance
export const contractNotificationService = new ContractNotificationService();