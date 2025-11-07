import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PaymentStatusUpdateRequest {
  status: 'paid' | 'processing' | 'failed' | 'unpaid';
  transactionHash?: string;
  paymentAmount?: number;
  failureReason?: string;
  rollbackOnFailure?: boolean;
}

interface PaymentStatusResponse {
  success: boolean;
  milestone?: any;
  invoice?: any;
  error?: string;
  rollbackPerformed?: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PaymentStatusResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;
  const { 
    status, 
    transactionHash, 
    paymentAmount, 
    failureReason,
    rollbackOnFailure = true 
  }: PaymentStatusUpdateRequest = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
    });
  }

  if (!status || !['paid', 'processing', 'failed', 'unpaid'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Valid payment status is required (paid, processing, failed, unpaid)'
    });
  }

  try {
    // Get milestone details with contract info
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        description,
        amount,
        status,
        payment_status,
        contract_id,
        invoice_id,
        transaction_hash,
        payment_amount,
        paid_at
      `)
      .eq('id', id)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        id,
        title,
        client_id,
        freelancer_id,
        token_type,
        chain,
        status
      `)
      .eq('id', milestone.contract_id)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Validate status transition
    const validTransitions = getValidStatusTransitions(milestone.payment_status);
    if (!validTransitions.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status transition from ${milestone.payment_status} to ${status}`
      });
    }

    // Prepare update data
    const updateData: any = {
      payment_status: status,
      updated_at: new Date().toISOString()
    };

    // Handle specific status updates
    switch (status) {
      case 'paid':
        if (!transactionHash) {
          return res.status(400).json({
            success: false,
            error: 'Transaction hash is required for paid status'
          });
        }
        updateData.transaction_hash = transactionHash;
        updateData.payment_amount = paymentAmount || milestone.amount;
        updateData.paid_at = new Date().toISOString();
        break;

      case 'processing':
        // Clear any previous failure data
        updateData.transaction_hash = null;
        updateData.paid_at = null;
        break;

      case 'failed':
        if (rollbackOnFailure) {
          // Rollback to previous state
          updateData.payment_status = 'unpaid';
          updateData.transaction_hash = null;
          updateData.paid_at = null;
        }
        break;

      case 'unpaid':
        updateData.transaction_hash = null;
        updateData.payment_amount = null;
        updateData.paid_at = null;
        break;
    }

    // Update milestone payment status
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone payment status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update payment status'
      });
    }

    // Update related invoice status if exists
    let updatedInvoice = null;
    if (milestone.invoice_id) {
      const invoiceStatus = getInvoiceStatusFromPaymentStatus(status);
      
      const { data: invoice, error: invoiceUpdateError } = await supabase
        .from('contract_invoices')
        .update({
          status: invoiceStatus,
          payment_hash: transactionHash || null,
          payment_confirmed_at: status === 'paid' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', milestone.invoice_id)
        .select()
        .single();

      if (!invoiceUpdateError) {
        updatedInvoice = invoice;
      } else {
        console.error('Warning: Failed to update invoice status:', invoiceUpdateError);
      }
    }

    // Send notifications based on status
    await handlePaymentStatusNotifications(
      status,
      updatedMilestone,
      contract,
      transactionHash,
      failureReason
    );

    // Update contract amount_paid if payment completed
    if (status === 'paid') {
      await updateContractPaidAmount(contract.id);
    }

    return res.status(200).json({
      success: true,
      milestone: updatedMilestone,
      invoice: updatedInvoice,
      rollbackPerformed: status === 'failed' && rollbackOnFailure
    });

  } catch (error) {
    console.error('Error updating payment status:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Gets valid status transitions for payment status
 */
function getValidStatusTransitions(currentStatus: string): string[] {
  const transitions: Record<string, string[]> = {
    'unpaid': ['processing', 'paid'],
    'processing': ['paid', 'failed', 'unpaid'],
    'paid': ['unpaid'], // Allow rollback in case of disputes
    'failed': ['processing', 'unpaid']
  };

  return transitions[currentStatus] || [];
}

/**
 * Maps payment status to invoice status
 */
function getInvoiceStatusFromPaymentStatus(paymentStatus: string): string {
  const statusMap: Record<string, string> = {
    'unpaid': 'pending',
    'processing': 'processing',
    'paid': 'paid',
    'failed': 'pending'
  };

  return statusMap[paymentStatus] || 'pending';
}

/**
 * Updates the contract's total paid amount
 */
async function updateContractPaidAmount(contractId: string) {
  try {
    // Calculate total paid amount from all paid milestones
    const { data: paidMilestones } = await supabase
      .from('contract_milestones')
      .select('payment_amount, amount')
      .eq('contract_id', contractId)
      .eq('payment_status', 'paid');

    if (paidMilestones) {
      const totalPaid = paidMilestones.reduce((sum, milestone) => {
        return sum + (milestone.payment_amount || milestone.amount || 0);
      }, 0);

      await supabase
        .from('contracts')
        .update({ 
          amount_paid: totalPaid,
          updated_at: new Date().toISOString()
        })
        .eq('id', contractId);
    }
  } catch (error) {
    console.error('Error updating contract paid amount:', error);
  }
}

/**
 * Handles notifications for payment status changes
 */
async function handlePaymentStatusNotifications(
  status: string,
  milestone: any,
  contract: any,
  transactionHash?: string,
  failureReason?: string
) {
  try {
    // Get user details for notifications
    const { data: freelancer } = await supabase
      .from('auth.users')
      .select('email, raw_user_meta_data')
      .eq('id', contract.freelancer_id)
      .single();

    const { data: client } = await supabase
      .from('auth.users')
      .select('email, raw_user_meta_data')
      .eq('id', contract.client_id)
      .single();

    const freelancerEmail = freelancer?.email;
    const clientEmail = client?.email;
    const freelancerName = freelancer?.raw_user_meta_data?.name || 'Freelancer';
    const clientName = client?.raw_user_meta_data?.name || 'Client';

    switch (status) {
      case 'paid':
        // Notify freelancer of payment completion
        if (freelancerEmail) {
          await sendPaymentCompletedNotification(
            freelancerEmail,
            freelancerName,
            milestone,
            contract,
            transactionHash
          );
        }
        
        // Notify client of payment confirmation
        if (clientEmail) {
          await sendPaymentConfirmationNotification(
            clientEmail,
            clientName,
            milestone,
            contract,
            transactionHash
          );
        }
        break;

      case 'failed':
        // Notify both parties of payment failure
        if (freelancerEmail) {
          await sendPaymentFailedNotification(
            freelancerEmail,
            freelancerName,
            milestone,
            contract,
            failureReason,
            'freelancer'
          );
        }
        
        if (clientEmail) {
          await sendPaymentFailedNotification(
            clientEmail,
            clientName,
            milestone,
            contract,
            failureReason,
            'client'
          );
        }
        break;

      case 'processing':
        // Notify freelancer that payment is being processed
        if (freelancerEmail) {
          await sendPaymentProcessingNotification(
            freelancerEmail,
            freelancerName,
            milestone,
            contract
          );
        }
        break;
    }

    // Record notification in database
    await supabase.from('contract_notifications').insert({
      contract_id: contract.id,
      recipient: 'both',
      notification_type: `payment_${status}`,
      subject: `Payment ${status} for ${milestone.title}`,
      message: `Milestone payment status updated to ${status}`,
      sent_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error sending payment status notifications:', error);
  }
}

async function sendPaymentCompletedNotification(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  transactionHash?: string
) {
  const subject = `💰 Payment Received: ${milestone.title}`;
  const currency = contract.token_type || 'USDC';
  
  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .amount { font-size: 24px; font-weight: bold; color: #10b981; }
        .success { background: #f0fdf4; border: 1px solid #10b981; padding: 20px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">💰</div>
          <h1>Payment Received!</h1>
          <p>Your milestone payment has been confirmed</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="success">
            <strong>🎉 Payment Confirmed!</strong><br>
            Your payment for "${milestone.title}" has been successfully received and confirmed on the blockchain.
          </div>
          
          <h3>💰 Payment Details</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.payment_amount || milestone.amount} ${currency}</span></li>
            <li><strong>Network:</strong> ${contract.chain}</li>
            ${transactionHash ? `<li><strong>Transaction:</strong> ${transactionHash}</li>` : ''}
          </ul>
          
          <p>The payment has been confirmed on the blockchain and is now available in your wallet. 🚀</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}

async function sendPaymentConfirmationNotification(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  transactionHash?: string
) {
  const subject = `✅ Payment Confirmed: ${milestone.title}`;
  const currency = contract.token_type || 'USDC';
  
  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .amount { font-size: 20px; font-weight: bold; color: #6366f1; }
        .success { background: #f0f9ff; border: 1px solid #6366f1; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
          <h1>Payment Confirmed</h1>
          <p>Your payment has been successfully processed</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="success">
            <strong>✅ Payment Successful!</strong><br>
            Your payment for "${milestone.title}" has been confirmed and the freelancer has been notified.
          </div>
          
          <h3>💰 Payment Summary</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.payment_amount || milestone.amount} ${currency}</span></li>
            <li><strong>Network:</strong> ${contract.chain}</li>
            ${transactionHash ? `<li><strong>Transaction:</strong> ${transactionHash}</li>` : ''}
          </ul>
          
          <p>Thank you for using our secure payment system! 🚀</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}

async function sendPaymentFailedNotification(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  failureReason?: string,
  userType: 'client' | 'freelancer' = 'freelancer'
) {
  const subject = `❌ Payment Failed: ${milestone.title}`;
  const currency = contract.token_type || 'USDC';
  
  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .amount { font-size: 20px; font-weight: bold; color: #ef4444; }
        .error { background: #fef2f2; border: 1px solid #ef4444; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
          <h1>Payment Failed</h1>
          <p>There was an issue processing the payment</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="error">
            <strong>❌ Payment Failed</strong><br>
            The payment for "${milestone.title}" could not be processed.
            ${failureReason ? `<br><br><strong>Reason:</strong> ${failureReason}` : ''}
          </div>
          
          <h3>💰 Payment Details</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Network:</strong> ${contract.chain}</li>
          </ul>
          
          ${userType === 'client' ? `
            <h3>🔄 Next Steps</h3>
            <ol>
              <li>Check your wallet balance and network connection</li>
              <li>Ensure you have sufficient funds for the payment and gas fees</li>
              <li>Try the payment again</li>
              <li>Contact support if the issue persists</li>
            </ol>
          ` : `
            <p>The client has been notified and will retry the payment. You'll be notified once the payment is successful.</p>
          `}
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}

async function sendPaymentProcessingNotification(
  email: string,
  name: string,
  milestone: any,
  contract: any
) {
  const subject = `⏳ Payment Processing: ${milestone.title}`;
  const currency = contract.token_type || 'USDC';
  
  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .amount { font-size: 20px; font-weight: bold; color: #f59e0b; }
        .processing { background: #fffbeb; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
          <h1>Payment Processing</h1>
          <p>Your payment is being processed</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="processing">
            <strong>⏳ Payment in Progress</strong><br>
            Your payment for "${milestone.title}" is currently being processed on the blockchain.
          </div>
          
          <h3>💰 Payment Details</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Network:</strong> ${contract.chain}</li>
          </ul>
          
          <p>We'll notify you once the payment is confirmed on the blockchain. This usually takes a few minutes. 🚀</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}