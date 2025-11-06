import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../../lib/emailService';
import { autoGenerateInvoiceOnApproval } from '../../../../services/invoiceAutoGenerationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ApprovalResponse {
  success: boolean;
  message?: string;
  milestone?: any;
  invoice?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApprovalResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;
  const { approval_feedback, client_id } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
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
        deliverables,
        completion_notes,
        contract_id
      `)
      .eq('id', id)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    // Get contract details separately
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select(`
        id,
        project_title,
        freelancer_id,
        client_email,
        currency,
        token_type
      `)
      .eq('id', milestone.contract_id)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    if (milestone.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        error: 'Milestone must be submitted before it can be approved'
      });
    }

    if (milestone.status === 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Milestone is already approved'
      });
    }

    // Update milestone status to approved
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'approved',
        approval_feedback: approval_feedback || 'Approved by client',
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to approve milestone'
      });
    }

    // Auto-generate invoice for the approved milestone
    const invoiceResult = await autoGenerateInvoiceOnApproval(id, milestone.contract_id);
    if (!invoiceResult.success) {
      console.error('Warning: Failed to auto-generate invoice:', invoiceResult.error);
      // Continue with approval process even if invoice generation fails
    }

    // Find and update the corresponding invoice to 'sent' status, or create one if it doesn't exist
    let invoice = null;
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('project_contract_id', contract.id)
      .eq('amount', milestone.amount)
      .eq('status', 'draft')
      .limit(1);

    if (invoices && invoices.length > 0) {
      // Update existing draft invoice
      const { data: updatedInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .update({
          status: 'sent',
          project_description: `${contract.project_title} - ${milestone.title} (APPROVED)`,
          additional_notes: `Milestone approved by client. ${approval_feedback || ''}`.trim()
        })
        .eq('id', invoices[0].id)
        .select()
        .single();

      if (!invoiceError) {
        invoice = updatedInvoice;
      }
    } else {
      // Create new invoice for the approved milestone
      const invoiceNumber = `INV-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 1000)}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      const { data: newInvoice, error: createInvoiceError } = await supabase
        .from('invoices')
        .insert({
          freelancer_name: 'Freelancer',
          freelancer_email: '',
          client_name: 'Client',
          client_email: contract.client_email || '',
          date_created: new Date().toISOString(),
          project_description: `${contract.project_title} - ${milestone.title} (APPROVED)`,
          amount: milestone.amount,
          currency: contract.currency || 'USDC',
          status: 'sent',
          invoice_number: invoiceNumber,
          due_date: dueDate.toISOString().split('T')[0],
          additional_notes: `Milestone approved by client. ${approval_feedback || ''}`.trim(),
          project_contract_id: contract.id,
          user_id: contract.freelancer_id,
          payment_methods: {
            cusd_celo: false,
            usdc_base: true
          },
          quantity: 1,
          rate: milestone.amount
        })
        .select()
        .single();

      if (!createInvoiceError) {
        invoice = newInvoice;
      } else {
        console.error('Error creating invoice for approved milestone:', createInvoiceError);
      }
    }

    // Get freelancer details for notifications
    let freelancerName = 'Freelancer';
    let freelancerEmail = null;
    let telegramChatId = null;
    
    if (contract.freelancer_id) {
      const { data: freelancer } = await supabase
        .from('users')
        .select('email, username, first_name, last_name, telegram_chat_id')
        .eq('id', contract.freelancer_id)
        .single();

      if (freelancer) {
        freelancerEmail = freelancer.email;
        telegramChatId = freelancer.telegram_chat_id;
        freelancerName = freelancer.username || 
          `${freelancer.first_name || ''} ${freelancer.last_name || ''}`.trim() || 
          'Freelancer';
      }
    }

    // Send approval notification to freelancer
    if (freelancerEmail) {
      try {
        await sendMilestoneApprovalNotification(
          freelancerEmail,
          freelancerName,
          milestone,
          contract,
          approval_feedback,
          invoice
        );

        // Send Telegram notification if available
        if (telegramChatId) {
          await sendMilestoneApprovalTelegram(
            telegramChatId,
            milestone,
            contract,
            invoice
          );
        }
      } catch (emailError) {
        console.error('Failed to send freelancer notification:', emailError);
      }
    }

    // Send confirmation to client
    if (contract.client_email) {
      try {
        await sendClientApprovalConfirmation(
          contract.client_email,
          'Client',
          milestone,
          contract,
          freelancerName,
          invoice
        );
      } catch (emailError) {
        console.error('Failed to send client confirmation:', emailError);
      }
    }

    // Record notification in milestone_notifications table
    await supabase.from('milestone_notifications').insert({
      milestone_id: milestone.id,
      contract_id: milestone.contract_id,
      notification_type: 'approved',
      recipient_type: 'freelancer',
      freelancer_email: freelancerEmail,
      client_email: contract.client_email,
      sent_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'Milestone approved successfully. Freelancer has been notified and invoice is ready for payment.',
      milestone: updatedMilestone,
      invoice: invoice
    });

  } catch (error) {
    console.error('Error approving milestone:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function sendMilestoneApprovalNotification(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  approvalFeedback: string,
  invoice: any
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = `🎉 Milestone Approved: ${milestone.title}`;

  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 24px; font-weight: bold; color: #10b981; }
        .success { background: #f0fdf4; border: 1px solid #10b981; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .feedback { background: #f8f9fa; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
          <h1>Milestone Approved!</h1>
          <p>Your work has been approved and payment is ready</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="success">
            <strong>🎉 Congratulations!</strong><br>
            Your milestone "${milestone.title}" has been approved by the client. Payment is now ready for processing!
          </div>
          
          <h3>📋 Approved Milestone</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.project_title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Status:</strong> ✅ Approved</li>
          </ul>
          
          ${approvalFeedback ? `
            <div class="feedback">
              <h4>💬 Client Feedback:</h4>
              <p>"${approvalFeedback}"</p>
            </div>
          ` : ''}
          
          ${invoice ? `
            <h3>💰 Payment Information</h3>
            <ul>
              <li><strong>Invoice Number:</strong> ${invoice.invoice_number}</li>
              <li><strong>Status:</strong> Ready for Payment</li>
              <li><strong>Amount:</strong> <span class="amount">${invoice.amount} ${invoice.currency}</span></li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/invoice/${invoice.id}?contract=${contract.id}&milestone=${milestone.id}" class="button">💰 Pay Now</a>
            </div>
          ` : ''}
          
          <h3>🚀 What's Next</h3>
          <ol>
            <li><strong>Payment Processing</strong> - The client will process payment using cryptocurrency</li>
            <li><strong>Payment Notification</strong> - You'll be notified when payment is received</li>
            <li><strong>Next Milestone</strong> - You can start working on the next milestone if available</li>
            <li><strong>Project Completion</strong> - Continue until all milestones are complete</li>
          </ol>
          
          <p>Excellent work! Keep up the momentum for the remaining milestones. 🚀</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Track your earnings at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}

async function sendMilestoneApprovalTelegram(
  telegramChatId: string,
  milestone: any,
  contract: any,
  invoice: any
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const message = `🎉 *Milestone Approved!*

Congratulations! Your work has been approved!

📋 *Project:* "${contract.project_title}"
🎯 *Milestone:* ${milestone.title}
💰 *Amount:* ${milestone.amount} ${currency}
✅ *Status:* Approved

*What's Next:*
• Client will process payment using cryptocurrency
• You'll be notified when payment is received
• You can start the next milestone if available

${invoice ? `\n💰 *Invoice:* ${invoice.invoice_number}\n[View Invoice](${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/invoices/${invoice.id})` : ''}

Excellent work! Keep up the momentum! 🚀`;

  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.statusText}`);
  }
}

async function sendClientApprovalConfirmation(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  freelancerName: string,
  invoice: any = null
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = `✅ Milestone Approved: ${milestone.title}`;

  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 20px; font-weight: bold; color: #6366f1; }
        .success { background: #f0f9ff; border: 1px solid #6366f1; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
          <h1>Milestone Approved</h1>
          <p>Payment is ready for processing</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="success">
            <strong>✅ Milestone approved successfully!</strong><br>
            You have approved "${milestone.title}" and the freelancer has been notified.
          </div>
          
          <h3>📋 Approved Milestone</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.project_title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Freelancer:</strong> ${freelancerName}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="button">📋 View Contract</a>
          </div>
          
          ${invoice ? `
            <div style="text-align: center; margin: 20px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/invoice/${invoice.id}?contract=${contract.id}&milestone=${milestone.id}" class="button" style="background: #10b981;">💰 Pay Now</a>
            </div>
          ` : ''}
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li><strong>Process Payment</strong> - Use the link above to pay the freelancer</li>
            <li><strong>Payment Confirmation</strong> - Both you and the freelancer will be notified</li>
            <li><strong>Continue Project</strong> - The freelancer can start the next milestone</li>
          </ol>
          
          <p><strong>Payment Method:</strong> You can pay using cryptocurrency (USDC/cUSD) through our secure payment system.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Manage your projects at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}