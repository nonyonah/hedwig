// src/lib/offrampStatusTemplates.ts
// Comprehensive status templates for Paycrest offramp notifications
// Based on Paycrest Sender API documentation: https://docs.paycrest.io/implementation-guides/sender-api-integration#webhook-implementation

export interface OfframpStatusData {
  orderId: string;
  amount: number;
  currency: string;
  token: string;
  network: string;
  transactionHash?: string;
  transactionReference?: string;
  recipient?: {
    institution: string;
    accountName: string;
    accountIdentifier: string;
    currency: string;
  };
  rate?: number;
  expectedAmount?: number;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  failureReason?: string;
  refundReason?: string;
}

export interface StatusTemplate {
  text: string;
  reply_markup?: {
    inline_keyboard: Array<Array<{
      text: string;
      callback_data: string;
      url?: string;
    }>>;
  };
  parse_mode?: 'Markdown' | 'HTML';
}

/**
 * Comprehensive status templates based on Paycrest documentation
 * Handles all possible order statuses with user-friendly messages
 */
export class OfframpStatusTemplates {
  
  /**
   * Get status template based on Paycrest order status
   */
  static getStatusTemplate(status: string, data: OfframpStatusData): StatusTemplate {
    const normalizedStatus = status.toLowerCase().trim();
    
    switch (normalizedStatus) {
      // Success states
      case 'completed':
      case 'fulfilled':
      case 'success':
      case 'settled':
      case 'delivered':
        return this.getCompletedTemplate(data);
      
      // Processing states
      case 'pending':
      case 'processing':
      case 'awaiting_transfer':
      case 'in_progress':
      case 'submitted':
      case 'confirming':
        return this.getProcessingTemplate(data);
      
      // Failure states
      case 'failed':
      case 'error':
      case 'cancelled':
      case 'rejected':
      case 'declined':
        return this.getFailedTemplate(data);
      
      // Refund states
      case 'refunded':
      case 'refund_pending':
      case 'refund_processing':
      case 'refund_completed':
        return this.getRefundTemplate(data);
      
      // Expired states
      case 'expired':
      case 'timeout':
        return this.getExpiredTemplate(data);
      
      // On-hold states
      case 'on_hold':
      case 'under_review':
      case 'requires_verification':
        return this.getOnHoldTemplate(data);
      
      // Unknown status
      default:
        return this.getUnknownStatusTemplate(status, data);
    }
  }

  /**
   * Template for completed/successful withdrawals
   */
  private static getCompletedTemplate(data: OfframpStatusData): StatusTemplate {
    const amount = data.expectedAmount || data.amount;
    const currency = data.recipient?.currency || data.currency;
    const institution = data.recipient?.institution || 'your bank';
    const accountName = data.recipient?.accountName || 'your account';
    
    return {
      text: `✅ **Withdrawal Completed Successfully!**\n\n` +
        `🎉 Your funds have been delivered to ${institution}!\n\n` +
        `💰 **Amount:** ${amount} ${currency}\n` +
        `🏦 **Recipient:** ${accountName}\n` +
        `📋 **Order ID:** ${data.orderId}\n` +
        `⏰ **Completed:** ${new Date().toLocaleString()}\n\n` +
        `💡 **Your funds should appear in your account within 2-5 minutes.**\n\n` +
        `Thank you for using Hedwig! 🚀`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📊 View History", callback_data: "offramp_history" },
            { text: "💸 New Withdrawal", callback_data: "action_offramp" }
          ],
          [
            { text: "💬 Rate Experience", callback_data: "rate_offramp" }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Template for processing/pending withdrawals
   */
  private static getProcessingTemplate(data: OfframpStatusData): StatusTemplate {
    const amount = data.expectedAmount || data.amount;
    const currency = data.recipient?.currency || data.currency;
    const institution = data.recipient?.institution || 'your bank';
    
    return {
      text: `🔄 **Withdrawal In Progress**\n\n` +
        `Your withdrawal is being processed by ${institution}.\n\n` +
        `💰 **Amount:** ${amount} ${currency}\n` +
        `📋 **Order ID:** ${data.orderId}\n` +
        `⏰ **Status:** Processing\n\n` +
        `⏳ **Estimated completion:** 5-15 minutes\n` +
        `📱 **You'll receive a notification when complete**\n\n` +
        `Please be patient while we process your withdrawal.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔍 Check Status", callback_data: `check_offramp_status_${data.orderId}` },
            { text: "📞 Contact Support", callback_data: "contact_support" }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Template for failed withdrawals
   */
  private static getFailedTemplate(data: OfframpStatusData): StatusTemplate {
    const amount = data.expectedAmount || data.amount;
    const currency = data.recipient?.currency || data.currency;
    const reason = data.failureReason || 'Technical issue occurred';
    
    return {
      text: `❌ **Withdrawal Failed**\n\n` +
        `We're sorry, your withdrawal could not be completed.\n\n` +
        `💰 **Amount:** ${amount} ${currency}\n` +
        `📋 **Order ID:** ${data.orderId}\n` +
        `❗ **Reason:** ${reason}\n\n` +
        `🔄 **Next Steps:**\n` +
        `• Your ${data.token} will be automatically refunded\n` +
        `• Refund typically takes 5-10 minutes\n` +
        `• You'll receive a notification when complete\n\n` +
        `💬 Need help? Contact our support team.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Try Again", callback_data: "action_offramp" },
            { text: "💬 Contact Support", callback_data: "contact_support" }
          ],
          [
            { text: "📊 View History", callback_data: "offramp_history" }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Template for refund notifications
   */
  private static getRefundTemplate(data: OfframpStatusData): StatusTemplate {
    const amount = data.amount;
    const token = data.token;
    const reason = data.refundReason || 'withdrawal could not be completed';
    
    return {
      text: `🔄 **Refund Processed**\n\n` +
        `Your withdrawal has been refunded successfully.\n\n` +
        `💰 **Refunded:** ${amount} ${token}\n` +
        `📋 **Order ID:** ${data.orderId}\n` +
        `❗ **Reason:** ${reason}\n\n` +
        `✅ **Your ${token} has been returned to your wallet.**\n\n` +
        `You can try the withdrawal again or contact support if you need assistance.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Try Again", callback_data: "action_offramp" },
            { text: "💰 Check Balance", callback_data: "check_balance" }
          ],
          [
            { text: "💬 Contact Support", callback_data: "contact_support" }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Template for expired orders
   */
  private static getExpiredTemplate(data: OfframpStatusData): StatusTemplate {
    const amount = data.amount;
    const token = data.token;
    
    return {
      text: `⏰ **Withdrawal Expired**\n\n` +
        `Your withdrawal order has expired and been cancelled.\n\n` +
        `💰 **Amount:** ${amount} ${token}\n` +
        `📋 **Order ID:** ${data.orderId}\n\n` +
        `🔄 **Your ${token} has been automatically refunded to your wallet.**\n\n` +
        `You can start a new withdrawal anytime.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 New Withdrawal", callback_data: "action_offramp" },
            { text: "💰 Check Balance", callback_data: "check_balance" }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Template for orders on hold or under review
   */
  private static getOnHoldTemplate(data: OfframpStatusData): StatusTemplate {
    const amount = data.expectedAmount || data.amount;
    const currency = data.recipient?.currency || data.currency;
    
    return {
      text: `⏸️ **Withdrawal Under Review**\n\n` +
        `Your withdrawal is currently under review for security purposes.\n\n` +
        `💰 **Amount:** ${amount} ${currency}\n` +
        `📋 **Order ID:** ${data.orderId}\n` +
        `🔍 **Status:** Under Review\n\n` +
        `⏳ **This usually takes 15-30 minutes**\n` +
        `📱 **You'll be notified once review is complete**\n\n` +
        `This is a standard security procedure to protect your funds.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔍 Check Status", callback_data: `check_offramp_status_${data.orderId}` },
            { text: "💬 Contact Support", callback_data: "contact_support" }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Template for unknown/unhandled statuses
   */
  private static getUnknownStatusTemplate(status: string, data: OfframpStatusData): StatusTemplate {
    const amount = data.expectedAmount || data.amount;
    const currency = data.recipient?.currency || data.currency;
    
    return {
      text: `🔄 **Withdrawal Status Update**\n\n` +
        `Your withdrawal status has been updated.\n\n` +
        `💰 **Amount:** ${amount} ${currency}\n` +
        `📋 **Order ID:** ${data.orderId}\n` +
        `📊 **Status:** ${status}\n` +
        `⏰ **Updated:** ${new Date().toLocaleString()}\n\n` +
        `We're monitoring your withdrawal and will notify you of any changes.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔍 Check Status", callback_data: `check_offramp_status_${data.orderId}` },
            { text: "💬 Contact Support", callback_data: "contact_support" }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Get a simple status emoji for quick reference
   */
  static getStatusEmoji(status: string): string {
    const normalizedStatus = status.toLowerCase().trim();
    
    switch (normalizedStatus) {
      case 'completed':
      case 'fulfilled':
      case 'success':
      case 'settled':
      case 'delivered':
        return '✅';
      
      case 'pending':
      case 'processing':
      case 'awaiting_transfer':
      case 'in_progress':
      case 'submitted':
      case 'confirming':
        return '🔄';
      
      case 'failed':
      case 'error':
      case 'cancelled':
      case 'rejected':
      case 'declined':
        return '❌';
      
      case 'refunded':
      case 'refund_pending':
      case 'refund_processing':
      case 'refund_completed':
        return '🔄';
      
      case 'expired':
      case 'timeout':
        return '⏰';
      
      case 'on_hold':
      case 'under_review':
      case 'requires_verification':
        return '⏸️';
      
      default:
        return '📊';
    }
  }

  /**
   * Get user-friendly status text
   */
  static getStatusText(status: string): string {
    const normalizedStatus = status.toLowerCase().trim();
    
    switch (normalizedStatus) {
      case 'completed':
      case 'fulfilled':
      case 'success':
      case 'settled':
      case 'delivered':
        return 'Completed';
      
      case 'pending':
        return 'Pending';
      case 'processing':
        return 'Processing';
      case 'awaiting_transfer':
        return 'Awaiting Transfer';
      case 'in_progress':
        return 'In Progress';
      case 'submitted':
        return 'Submitted';
      case 'confirming':
        return 'Confirming';
      
      case 'failed':
        return 'Failed';
      case 'error':
        return 'Error';
      case 'cancelled':
        return 'Cancelled';
      case 'rejected':
        return 'Rejected';
      case 'declined':
        return 'Declined';
      
      case 'refunded':
        return 'Refunded';
      case 'refund_pending':
        return 'Refund Pending';
      case 'refund_processing':
        return 'Refund Processing';
      case 'refund_completed':
        return 'Refund Completed';
      
      case 'expired':
        return 'Expired';
      case 'timeout':
        return 'Timed Out';
      
      case 'on_hold':
        return 'On Hold';
      case 'under_review':
        return 'Under Review';
      case 'requires_verification':
        return 'Requires Verification';
      
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }
}