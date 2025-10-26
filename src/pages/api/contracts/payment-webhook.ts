import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PaymentWebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface PaymentEvent {
  invoice_id?: string;
  contract_id?: string;
  milestone_id?: string;
  amount: number;
  currency: string;
  transaction_hash?: string;
  payment_method: string;
  status: 'completed' | 'pending' | 'failed';
  payer_address?: string;
  recipient_address?: string;
  platform_fee?: number;
  net_amount?: number;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<PaymentWebhookResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    // Verify webhook signature if needed (implement based on your payment provider)
    // const signature = req.headers['x-webhook-signature'];
    // if (!verifyWebhookSignature(req.body, signature)) {
    //   return res.status(401).json({ success: false, error: 'Invalid signature' });
    // }

    const paymentEvent: PaymentEvent = req.body;

    console.log('[Payment Webhook] Received payment event:', paymentEvent);

    // Validate required fields
    if (!paymentEvent.amount || !paymentEvent.currency || !paymentEvent.status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required payment fields' 
      });
    }

    // Only process completed payments
    if (paymentEvent.status !== 'completed') {
      console.log('[Payment Webhook] Ignoring non-completed payment:', paymentEvent.status);
      return res.status(200).json({ 
        success: true, 
        message: 'Payment status noted but not processed' 
      });
    }

    // Handle payment based on whether it's for a specific invoice/milestone or contract
    if (paymentEvent.invoice_id) {
      await handleInvoicePayment(paymentEvent);
    } else if (paymentEvent.milestone_id) {
      await handleMilestonePayment(paymentEvent);
    } else if (paymentEvent.contract_id) {
      await handleContractPayment(paymentEvent);
    } else {
      console.error('[Payment Webhook] No valid identifier found in payment event');
      return res.status(400).json({ 
        success: false, 
        error: 'No valid payment identifier found' 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Payment processed successfully' 
    });

  } catch (error) {
    console.error('[Payment Webhook] Error processing payment:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

// Handle payment for a specific invoice
async function handleInvoicePayment(paymentEvent: PaymentEvent) {
  const { invoice_id, amount, currency, transaction_hash, platform_fee, net_amount } = paymentEvent;

  // Get invoice details
  const { data: invoice, error: invoiceError } = await supabase
    .from('contract_invoices')
    .select(`
      *,
      contracts!contract_invoices_contract_id_fkey (
        *,
        users!contracts_freelancer_id_fkey (
          id,
          username,
          email,
          telegram_user_id
        )
      ),
      contract_milestones!contract_invoices_milestone_id_fkey (*)
    `)
    .eq('id', invoice_id)
    .single();

  if (invoiceError || !invoice) {
    console.error('[Payment Webhook] Invoice not found:', invoice_id);
    return;
  }

  // Check if invoice is already paid
  if (invoice.status === 'paid') {
    console.log('[Payment Webhook] Invoice already marked as paid:', invoice_id);
    return;
  }

  // Update invoice status
  const { error: updateInvoiceError } = await supabase
    .from('contract_invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_amount: amount,
      transaction_hash: transaction_hash,
      platform_fee: platform_fee || 0,
      net_amount: net_amount || amount
    })
    .eq('id', invoice_id);

  if (updateInvoiceError) {
    console.error('[Payment Webhook] Failed to update invoice:', updateInvoiceError);
    return;
  }

  // Update milestone status if linked
  if (invoice.milestone_id) {
    await supabase
      .from('contract_milestones')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString()
      })
      .eq('id', invoice.milestone_id);
  }

  // Update contract amount_paid
  const contract = invoice.contracts;
  const newAmountPaid = (contract.amount_paid || 0) + amount;
  
  await supabase
    .from('contracts')
    .update({
      amount_paid: newAmountPaid
    })
    .eq('id', contract.id);

  // Check if all milestones are paid to mark contract as completed
  await checkAndCompleteContract(contract.id);

  // Send notifications
  await sendPaymentNotifications(contract, invoice, amount, currency);

  console.log(`[Payment Webhook] Processed invoice payment: ${invoice_id}, amount: ${amount} ${currency}`);
}

// Handle payment for a specific milestone (direct payment)
async function handleMilestonePayment(paymentEvent: PaymentEvent) {
  const { milestone_id, amount, currency, transaction_hash, platform_fee, net_amount } = paymentEvent;

  // Get milestone and contract details
  const { data: milestone, error: milestoneError } = await supabase
    .from('contract_milestones')
    .select(`
      *,
      contracts!contract_milestones_contract_id_fkey (
        *,
        users!contracts_freelancer_id_fkey (
          id,
          username,
          email,
          telegram_user_id
        )
      )
    `)
    .eq('id', milestone_id)
    .single();

  if (milestoneError || !milestone) {
    console.error('[Payment Webhook] Milestone not found:', milestone_id);
    return;
  }

  // Check if milestone is already paid
  if (milestone.status === 'paid') {
    console.log('[Payment Webhook] Milestone already marked as paid:', milestone_id);
    return;
  }

  // Update milestone status
  const { error: updateMilestoneError } = await supabase
    .from('contract_milestones')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_amount: amount,
      transaction_hash: transaction_hash,
      platform_fee: platform_fee || 0,
      net_amount: net_amount || amount
    })
    .eq('id', milestone_id);

  if (updateMilestoneError) {
    console.error('[Payment Webhook] Failed to update milestone:', updateMilestoneError);
    return;
  }

  // Update related invoice if exists
  if (milestone.invoice_id) {
    await supabase
      .from('contract_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: amount,
        transaction_hash: transaction_hash
      })
      .eq('id', milestone.invoice_id);
  }

  // Update contract amount_paid
  const contract = milestone.contracts;
  const newAmountPaid = (contract.amount_paid || 0) + amount;
  
  await supabase
    .from('contracts')
    .update({
      amount_paid: newAmountPaid
    })
    .eq('id', contract.id);

  // Check if all milestones are paid to mark contract as completed
  await checkAndCompleteContract(contract.id);

  // Send notifications
  await sendPaymentNotifications(contract, milestone, amount, currency);

  console.log(`[Payment Webhook] Processed milestone payment: ${milestone_id}, amount: ${amount} ${currency}`);
}

// Handle general contract payment (when no specific milestone/invoice is specified)
async function handleContractPayment(paymentEvent: PaymentEvent) {
  const { contract_id, amount, currency, transaction_hash } = paymentEvent;

  if (!contract_id) {
    console.error('[Payment Webhook] Contract ID is required for contract payment');
    return;
  }

  // Get contract details
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select(`
      *,
      users!contracts_freelancer_id_fkey (
        id,
        username,
        email,
        telegram_user_id
      )
    `)
    .eq('id', contract_id)
    .single();

  if (contractError || !contract) {
    console.error('[Payment Webhook] Contract not found:', contract_id);
    return;
  }

  // Update contract amount_paid
  const newAmountPaid = (contract.amount_paid || 0) + amount;
  
  await supabase
    .from('contracts')
    .update({
      amount_paid: newAmountPaid
    })
    .eq('id', contract_id);

  // Check if contract is fully paid
  await checkAndCompleteContract(contract_id);

  // Send notifications
  await sendPaymentNotifications(contract, null, amount, currency);

  console.log(`[Payment Webhook] Processed contract payment: ${contract_id}, amount: ${amount} ${currency}`);
}

// Check if all milestones are paid and mark contract as completed
async function checkAndCompleteContract(contractId: string) {
  try {
    // Get contract and all milestones
    const { data: contract } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    const { data: milestones } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contractId);

    if (!contract || !milestones) return;

    // Check if all milestones are paid
    const allMilestonesPaid = milestones.every(milestone => milestone.status === 'paid');
    
    // Check if total amount is paid (with some tolerance for rounding)
    const totalPaid = contract.amount_paid || 0;
    const totalAmount = contract.total_amount;
    const isFullyPaid = Math.abs(totalPaid - totalAmount) < 0.01; // 1 cent tolerance

    if ((allMilestonesPaid || isFullyPaid) && contract.status !== 'completed') {
      // Mark contract as completed
      await supabase
        .from('contracts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', contractId);

      // Send completion notifications
      await sendContractCompletionNotifications(contract);

      console.log(`[Payment Webhook] Contract completed: ${contractId}`);
    }
  } catch (error) {
    console.error('[Payment Webhook] Error checking contract completion:', error);
  }
}

// Send payment notifications to freelancer and client
async function sendPaymentNotifications(contract: any, item: any, amount: number, currency: string) {
  try {
    const freelancer = contract.users;
    const itemType = item?.title ? 'milestone' : 'payment';
    const itemName = item?.title || 'payment';

    // Send email to freelancer
    if (freelancer?.email) {
      const emailTemplate = generatePaymentNotificationEmailTemplate(
        contract, 
        freelancer, 
        amount, 
        currency, 
        itemName,
        itemType
      );
      
      await sendSimpleEmail(
        freelancer.email,
        `💰 Payment Received: ${contract.title}`,
        emailTemplate
      );
    }

    // Create notification records
    await supabase.from('contract_notifications').insert([
      {
        contract_id: contract.id,
        recipient: 'freelancer',
        notification_type: 'payment_received',
        subject: `Payment Received: ${amount} ${currency}`,
        message: `You received a payment of ${amount} ${currency} for ${itemName} in contract "${contract.title}"`,
        sent_via_email: true
      },
      {
        contract_id: contract.id,
        recipient: 'client',
        notification_type: 'payment_confirmed',
        subject: `Payment Confirmed: ${amount} ${currency}`,
        message: `Your payment of ${amount} ${currency} for ${itemName} has been confirmed`,
        sent_via_email: false
      }
    ]);

  } catch (error) {
    console.error('[Payment Webhook] Error sending payment notifications:', error);
  }
}

// Send contract completion notifications
async function sendContractCompletionNotifications(contract: any) {
  try {
    const freelancer = contract.users;

    // Send email to freelancer
    if (freelancer?.email) {
      const emailTemplate = generateContractCompletionEmailTemplate(contract, freelancer);
      
      await sendSimpleEmail(
        freelancer.email,
        `🎉 Contract Completed: ${contract.title}`,
        emailTemplate
      );
    }

    // Create notification records
    await supabase.from('contract_notifications').insert([
      {
        contract_id: contract.id,
        recipient: 'freelancer',
        notification_type: 'contract_completed',
        subject: `Contract Completed: ${contract.title}`,
        message: `Your contract "${contract.title}" has been completed! All payments have been received.`,
        sent_via_email: true
      },
      {
        contract_id: contract.id,
        recipient: 'client',
        notification_type: 'contract_completed',
        subject: `Contract Completed: ${contract.title}`,
        message: `The contract "${contract.title}" has been completed successfully.`,
        sent_via_email: false
      }
    ]);

  } catch (error) {
    console.error('[Payment Webhook] Error sending completion notifications:', error);
  }
}

// Generate payment notification email template
function generatePaymentNotificationEmailTemplate(
  contract: any, 
  freelancer: any, 
  amount: number, 
  currency: string, 
  itemName: string,
  itemType: string
): string {
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
        .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 32px; font-weight: bold; color: #10b981; text-align: center; margin: 20px 0; }
        .money-emoji { font-size: 48px; margin-bottom: 20px; }
        .progress-bar { background: #e5e7eb; height: 20px; border-radius: 10px; margin: 20px 0; overflow: hidden; }
        .progress-fill { background: #10b981; height: 100%; border-radius: 10px; transition: width 0.3s ease; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="money-emoji">💰</div>
          <h1>Payment Received!</h1>
          <p>Your hard work is paying off</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${freelancer.username || freelancer.email}</strong>,</p>
          
          <p>Great news! You've received a payment for your work on "<strong>${contract.title}</strong>".</p>
          
          <div class="amount">${amount} ${currency}</div>
          
          <h3>💼 Payment Details</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Item:</strong> ${itemName}</li>
            <li><strong>Amount:</strong> ${amount} ${currency}</li>
            <li><strong>Client:</strong> ${contract.client_name || contract.client_email}</li>
            <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
          </ul>
          
          <h3>📊 Contract Progress</h3>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(100, ((contract.amount_paid || 0) / contract.total_amount) * 100)}%"></div>
          </div>
          <p style="text-align: center; margin: 10px 0;">
            <strong>${contract.amount_paid || 0} / ${contract.total_amount} ${currency}</strong> 
            (${Math.round(((contract.amount_paid || 0) / contract.total_amount) * 100)}% complete)
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="button">📋 View Contract</a>
          </div>
          
          ${contract.amount_paid >= contract.total_amount ? `
          <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <h3 style="color: #10b981; margin: 0 0 10px 0;">🎉 Contract Completed!</h3>
            <p style="margin: 0;">Congratulations! You've received all payments for this contract.</p>
          </div>
          ` : `
          <p><strong>Keep up the great work!</strong> Continue delivering quality results to receive the remaining payments.</p>
          `}
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Track your earnings and manage contracts at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate contract completion email template
function generateContractCompletionEmailTemplate(contract: any, freelancer: any): string {
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
        .button { display: inline-block; background: #8b5cf6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 32px; font-weight: bold; color: #8b5cf6; text-align: center; margin: 20px 0; }
        .celebration { font-size: 48px; margin-bottom: 20px; }
        .success-box { background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="celebration">🎉</div>
          <h1>Contract Completed!</h1>
          <p>Congratulations on your successful project</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${freelancer.username || freelancer.email}</strong>,</p>
          
          <div class="success-box">
            <h2 style="color: #10b981; margin: 0 0 15px 0;">🏆 Project Successfully Completed!</h2>
            <p style="margin: 0; font-size: 18px;">You've received all payments for "<strong>${contract.title}</strong>"</p>
          </div>
          
          <div class="amount">${contract.total_amount} ${contract.currency}</div>
          <p style="text-align: center; color: #666; margin-top: -10px;">Total earnings from this contract</p>
          
          <h3>📋 Contract Summary</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Client:</strong> ${contract.client_name || contract.client_email}</li>
            <li><strong>Total Amount:</strong> ${contract.total_amount} ${contract.currency}</li>
            <li><strong>Started:</strong> ${new Date(contract.created_at).toLocaleDateString()}</li>
            <li><strong>Completed:</strong> ${new Date().toLocaleDateString()}</li>
          </ul>
          
          <h3>🚀 What's Next?</h3>
          <ul>
            <li>Consider asking your client for a testimonial or review</li>
            <li>Update your portfolio with this successful project</li>
            <li>Look for new opportunities on Hedwig</li>
            <li>Keep building your freelance reputation</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/dashboard" class="button">📊 View Dashboard</a>
          </div>
          
          <p style="text-align: center; font-style: italic; color: #666;">
            "Success is not final, failure is not fatal: it is the courage to continue that counts." - Winston Churchill
          </p>
          
          <p><strong>Thank you for using Hedwig!</strong> We're proud to be part of your freelancing journey.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Continue growing your freelance business at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;
}