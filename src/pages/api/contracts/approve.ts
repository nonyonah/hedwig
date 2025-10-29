import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ApprovalResponse {
  success: boolean;
  message?: string;
  contract?: any;
  error?: string;
}



export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApprovalResponse>
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Handle token-based approval (Contracts 2.0)
    if (req.method === 'GET' || req.body.approval_token) {
      return await handleTokenApproval(req, res);
    }

    // Handle legacy contract approval (existing system)
    return await handleLegacyApproval(req, res);

  } catch (error) {
    console.error('Error in contract approval:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Handle Contracts 2.0 token-based approval
async function handleTokenApproval(
  req: NextApiRequest,
  res: NextApiResponse<ApprovalResponse>
) {
  const approval_token = req.method === 'GET'
    ? req.query.token as string
    : req.body.approval_token;

  if (!approval_token) {
    return res.status(400).json({
      success: false,
      error: 'Approval token is required'
    });
  }

  // Fetch contract by approval token
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select(`
      *,
      users!contracts_freelancer_id_fkey (
        id,
        username,
        email,
        telegram_chat_id
      )
    `)
    .eq('approval_token', approval_token)
    .single();

  if (contractError || !contract) {
    return res.status(404).json({
      success: false,
      error: 'Invalid or expired approval token'
    });
  }

  // Check if token is expired
  if (contract.approval_expires_at && new Date() > new Date(contract.approval_expires_at)) {
    return res.status(400).json({
      success: false,
      error: 'Approval token has expired'
    });
  }

  // Check if already approved
  if (contract.status === 'approved') {
    return res.status(400).json({
      success: false,
      error: 'Contract is already approved'
    });
  }

  // Check if declined
  if (contract.status === 'rejected') {
    return res.status(400).json({
      success: false,
      error: 'Contract has been declined'
    });
  }

  // Update contract status to approved
  const { data: updatedContract, error: updateError } = await supabase
    .from('contracts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approval_token: null, // Clear token after use
      approval_expires_at: null
    })
    .eq('id', contract.id)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating contract status:', updateError);
    return res.status(500).json({
      success: false,
      error: 'Failed to approve contract'
    });
  }

  // Auto-generate invoices for milestones
  await generateMilestoneInvoices(contract.id);

  // Send comprehensive notifications to freelancer
  const freelancer = Array.isArray(contract.users) ? contract.users[0] : contract.users;
  console.log('Sending notifications to freelancer (Contracts 2.0):', {
    freelancerId: contract.freelancer_id,
    freelancerEmail: freelancer?.email,
    telegramChatId: freelancer?.telegram_chat_id
  });

  if (freelancer?.email) {
    try {
      // Send email notification
      const emailTemplate = generateFreelancerNotificationEmailTemplate(contract, freelancer);
      await sendSimpleEmail(
        freelancer.email,
        `Contract Approved: ${contract.title}`,
        emailTemplate
      );
      console.log('Email notification sent to freelancer successfully (Contracts 2.0)');

      // Send Telegram notification if available
      if (freelancer.telegram_chat_id) {
        try {
          await sendTelegramNotification(freelancer.telegram_chat_id, contract);
          console.log('Telegram notification sent to freelancer successfully (Contracts 2.0)');
        } catch (telegramError) {
          console.error('Failed to send Telegram notification (Contracts 2.0):', telegramError);
        }
      } else {
        console.log('No Telegram chat ID found for freelancer (Contracts 2.0)');
      }

    } catch (emailError) {
      console.error('Failed to send notification email (Contracts 2.0):', emailError);
    }
  }

  // Send invoice notification to client
  if (contract.client_email) {
    try {
      await sendInvoiceToClient(contract);
      console.log('Invoice notification sent to client successfully (Contracts 2.0)');
    } catch (clientEmailError) {
      console.error('Failed to send invoice notification to client (Contracts 2.0):', clientEmailError);
    }
  }

  // Create notification records
  await supabase.from('contract_notifications').insert([
    {
      contract_id: contract.id,
      recipient: 'freelancer',
      notification_type: 'contract_approved',
      subject: `Contract Approved: ${contract.title}`,
      message: `Your contract "${contract.title}" has been approved by the client`,
      sent_via_email: true
    },
    {
      contract_id: contract.id,
      recipient: 'client',
      notification_type: 'contract_approved',
      subject: `Contract Approved: ${contract.title}`,
      message: `You have successfully approved the contract "${contract.title}"`,
      sent_via_email: false
    }
  ]);

  // For GET requests (direct link clicks), redirect to success page
  if (req.method === 'GET') {
    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/approved?id=${contract.id}`;
    return res.redirect(302, successUrl);
  }

  return res.status(200).json({
    success: true,
    message: 'Contract approved successfully',
    contract: updatedContract
  });
}

// Handle legacy contract approval (existing system)
async function handleLegacyApproval(
  req: NextApiRequest,
  res: NextApiResponse<ApprovalResponse>
) {
  const { contractId } = req.body;

  if (!contractId) {
    return res.status(400).json({
      success: false,
      error: 'Contract ID is required'
    });
  }

  // Fetch contract details from legacy table
  console.log('[Contract Approval] Looking for contract ID:', contractId);
  const { data: contract, error: contractError } = await supabase
    .from('project_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  console.log('[Contract Approval] Query result:', { contract, contractError });

  if (contractError || !contract) {
    console.error('[Contract Approval] Contract not found:', { contractId, contractError });
    return res.status(404).json({
      success: false,
      error: `Contract not found: ${contractError?.message || 'Unknown error'}`
    });
  }

  // Fetch freelancer user data separately
  let freelancerUser: any = null;
  if (contract.freelancer_id) {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, username, telegram_chat_id')
      .eq('id', contract.freelancer_id)
      .single();

    if (userData && !userError) {
      freelancerUser = {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        telegram_chat_id: userData.telegram_chat_id
      };
    }
  }

  // Add the user data to the contract object for compatibility
  (contract as any).users = freelancerUser;

  if (contract.status === 'approved') {
    return res.status(400).json({
      success: false,
      error: 'Contract is already approved'
    });
  }

  // Update contract status to approved
  const { error: updateError } = await supabase
    .from('project_contracts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString()
    })
    .eq('id', contractId);

  if (updateError) {
    console.error('Error updating legacy contract:', updateError);
    return res.status(500).json({
      success: false,
      error: 'Failed to approve contract'
    });
  }

  // Generate invoices for contract milestones
  let invoiceGenerated = false;
  try {
    await generateLegacyContractInvoices(contractId);
    invoiceGenerated = true;
    console.log('Successfully generated invoices for legacy contract:', contractId);
  } catch (invoiceError) {
    console.error('Failed to generate invoices for legacy contract:', invoiceError);
  }

  // Send invoice to client if generated successfully
  if (invoiceGenerated && contract.client_email) {
    try {
      await sendInvoiceToClient(contract);
    } catch (emailError) {
      console.error('Failed to send invoice email to client:', emailError);
    }
  }

  // Send comprehensive notifications to freelancer (email + Telegram)
  const freelancer = contract.users;
  console.log('Sending notifications to freelancer:', {
    freelancerId: contract.freelancer_id,
    freelancerEmail: freelancer?.email,
    telegramChatId: freelancer?.telegram_chat_id
  });

  if (freelancer && freelancer.email) {
    try {
      // Send email notification directly
      const emailTemplate = generateLegacyFreelancerNotificationEmailTemplate(contract, freelancer);
      await sendSimpleEmail(
        freelancer.email,
        `Contract Approved: ${contract.project_title || contract.title}`,
        emailTemplate
      );
      console.log('Email notification sent to freelancer successfully');

      // Send Telegram notification if user has Telegram
      if (freelancer.telegram_chat_id) {
        try {
          await sendTelegramNotification(freelancer.telegram_chat_id, contract);
          console.log('Telegram notification sent to freelancer successfully');
        } catch (telegramError) {
          console.error('Failed to send Telegram notification:', telegramError);
        }
      } else {
        console.log('No Telegram chat ID found for freelancer');
      }

    } catch (notificationError) {
      console.error('Failed to send contract approval notifications:', notificationError);
    }
  } else {
    console.warn('No freelancer email found for notifications:', {
      freelancerId: contract.freelancer_id,
      hasFreelancer: !!freelancer,
      freelancerEmail: freelancer?.email
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Contract approved successfully',
    contract: {
      id: contract.id,
      status: 'approved',
      approved_at: new Date().toISOString()
    }
  });
}

// Generate invoices for all milestones when contract is approved
async function generateMilestoneInvoices(contractId: string) {
  try {
    // Get contract and milestones
    const { data: contract } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    const { data: milestones } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contractId)
      .order('order_index');

    if (!contract || !milestones?.length) {
      console.error('Contract or milestones not found for invoice generation');
      return;
    }

    // Generate invoices for each milestone
    const invoiceInserts = milestones.map((milestone, index) => ({
      contract_id: contractId,
      milestone_id: milestone.id,
      client_email: contract.client_email,
      client_name: contract.client_name,
      freelancer_id: contract.freelancer_id,
      title: `${contract.title} - ${milestone.title}`,
      description: milestone.description || `Milestone ${index + 1} for ${contract.title}`,
      amount: milestone.amount,
      currency: contract.currency,
      due_date: milestone.due_date,
      status: 'pending'
    }));

    const { data: invoices, error: invoiceError } = await supabase
      .from('contract_invoices')
      .insert(invoiceInserts)
      .select();

    if (invoiceError) {
      console.error('Error generating milestone invoices:', invoiceError);
      return;
    }

    // Update milestones with invoice IDs
    for (let i = 0; i < invoices.length; i++) {
      await supabase
        .from('contract_milestones')
        .update({ invoice_id: invoices[i].id })
        .eq('id', milestones[i].id);
    }

    console.log(`Generated ${invoices.length} invoices for contract ${contractId}`);

  } catch (error) {
    console.error('Error in generateMilestoneInvoices:', error);
  }
}

async function sendTelegramNotification(telegramUserId: string, contract: any) {
  try {
    const message = `🎉 *Contract Approved!*

Hello! Great news!

📋 *Contract:* "${contract.project_title || contract.title}"
💰 *Value:* ${contract.total_amount} ${contract.currency || contract.token_type || 'USDC'}
✅ *Status:* Approved by client

*What's next:*
• Invoices have been generated and sent to the client
• You'll get payment notifications when they pay
• Focus on delivering great work!

Keep up the excellent work! 🚀`;

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }

    console.log('Telegram notification sent successfully');
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    throw error;
  }
}

async function sendInvoiceToClient(contract: any) {
  try {
    console.log('Sending invoice notification to client:', contract.client_email);

    const invoiceEmailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice Generated - Contract Approved</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 24px; font-weight: bold; color: #8b5cf6; }
          .invoice-emoji { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="invoice-emoji">📄</div>
            <h1>Invoice Generated</h1>
            <p>Your contract has been approved and invoices are ready</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${contract.client_name || 'Client'}</strong>,</p>
            
            <p>Great news! You have successfully approved the contract "<strong>${contract.project_title || contract.title}</strong>" and invoices have been automatically generated.</p>
            
            <h3>📋 Contract Details</h3>
            <ul>
              <li><strong>Project:</strong> ${contract.project_title || contract.title}</li>
              <li><strong>Freelancer:</strong> ${contract.freelancer_name || 'Freelancer'}</li>
              <li><strong>Total Amount:</strong> <span class="amount">${contract.total_amount} ${contract.currency || contract.token_type || 'USDC'}</span></li>
              <li><strong>Status:</strong> ✅ Approved</li>
            </ul>
            
            <h3>💰 Next Steps</h3>
            <ol>
              <li>The freelancer will begin work on your project</li>
              <li>You'll receive payment requests as milestones are completed</li>
              <li>Review and approve completed work</li>
              <li>Pay invoices using cryptocurrency when satisfied</li>
            </ol>
            
            <p><strong>Payment Process:</strong> You'll receive separate emails with payment links as the freelancer completes each milestone. All payments are processed securely using cryptocurrency.</p>
            
            <p>Thank you for using Hedwig for your project needs!</p>
          </div>
          
          <div class="footer">
            <p>This email was sent by Hedwig - Secure Freelance Payments</p>
            <p>Manage your projects at hedwigbot.xyz</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendSimpleEmail(
      contract.client_email,
      `Invoice Generated: ${contract.project_title || contract.title}`,
      invoiceEmailTemplate
    );

    console.log('Invoice notification sent to client successfully');
  } catch (error) {
    console.error('Error sending invoice notification to client:', error);
    throw error;
  }
}

async function generateLegacyContractInvoices(contractId: string) {
  try {
    console.log('Generating invoices for legacy contract:', contractId);

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      console.error('Error fetching legacy contract:', contractError);
      return;
    }

    // Fetch contract milestones
    const { data: milestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at');

    if (milestonesError) {
      console.error('Error fetching contract milestones:', milestonesError);
    }

    // If no milestones exist, create a single invoice for the full contract amount
    if (!milestones || milestones.length === 0) {
      console.log('No milestones found for legacy contract, creating single invoice for full amount:', contractId);
      
      // Generate invoice number
      const generateInvoiceNumber = (): string => {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `INV-${year}${month}${day}-${random}`;
      };

      // Create single invoice for full contract
      const invoiceData = {
        project_contract_id: contractId,
        invoice_number: generateInvoiceNumber(),
        freelancer_name: contract.freelancer_name || 'Freelancer',
        freelancer_email: contract.freelancer_email || '',
        client_name: contract.client_name || 'Client',
        client_email: contract.client_email || '',
        project_description: contract.project_description || contract.project_title || 'Project work',
        quantity: 1,
        rate: contract.total_amount,
        amount: contract.total_amount,
        currency: contract.currency || contract.token_type || 'USDC',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        status: 'draft',
        payment_methods: {
          usdc_base: contract.chain === 'base',
          cusd_celo: contract.chain === 'celo'
        },
        user_id: contract.freelancer_id
      };

      // Insert single invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert([invoiceData])
        .select()
        .single();

      if (invoiceError) {
        console.error('Error creating single invoice for legacy contract:', invoiceError);
        return;
      }

      console.log(`Created single invoice for legacy contract ${contractId}:`, invoice.id);
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

    // Create invoices for each milestone
    const invoiceInserts = milestones.map((milestone) => ({
      project_contract_id: contractId,
      invoice_number: generateInvoiceNumber(),
      freelancer_name: contract.freelancer_name || 'Freelancer',
      freelancer_email: contract.freelancer_email || '',
      client_name: contract.client_name || 'Client',
      client_email: contract.client_email || '',
      project_description: `${contract.project_title} - ${milestone.title}`,
      quantity: 1,
      rate: milestone.amount,
      amount: milestone.amount,
      currency: contract.currency || contract.token_type || 'USDC',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      status: 'draft',
      payment_methods: {
        usdc_base: contract.chain === 'base',
        cusd_celo: contract.chain === 'celo'
      },
      user_id: contract.freelancer_id
    }));

    // Insert invoices
    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .insert(invoiceInserts)
      .select();

    if (invoiceError) {
      console.error('Error creating invoices for legacy contract:', invoiceError);
      return;
    }

    console.log(`Created ${invoices?.length || 0} invoices for legacy contract ${contractId}`);

    // Update milestones with invoice IDs (if needed for tracking)
    if (invoices && invoices.length > 0) {
      for (let i = 0; i < invoices.length && i < milestones.length; i++) {
        await supabase
          .from('contract_milestones')
          .update({ invoice_id: invoices[i].id })
          .eq('id', milestones[i].id);
      }
    }

  } catch (error) {
    console.error('Error in generateLegacyContractInvoices:', error);
  }
}

function generateFreelancerNotificationEmailTemplate(contract: any, freelancer: any): string {
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
        .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
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
          <p>Your project is ready to begin</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${freelancer.username || freelancer.email}</strong>,</p>
          
          <p>Great news! Your contract for "<strong>${contract.title}</strong>" has been approved by the client. Invoices have been automatically generated for each milestone.</p>
          
          <h3>💰 Contract Details</h3>
          <ul>
            <li><strong>Total Amount:</strong> <span class="amount">${contract.total_amount} ${contract.currency}</span></li>
            <li><strong>Client:</strong> ${contract.client_name || contract.client_email}</li>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Deadline:</strong> ${new Date(contract.deadline).toLocaleDateString()}</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="button">📋 View Contract Details</a>
          </div>
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li>Review the contract details and milestones</li>
            <li>Start working on the first milestone</li>
            <li>Submit your work when ready for review</li>
            <li>Client will pay invoices as milestones are completed</li>
          </ol>
          
          <p><strong>Important:</strong> Invoices have been automatically generated for each milestone. The client will receive payment links and can pay as you complete each milestone.</p>
          
          <p>Good luck with your project! 🍀</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Manage your contracts and payments at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate email template for legacy freelancer notification
function generateLegacyFreelancerNotificationEmailTemplate(contract: any, freelancer: any): string {
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
        .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 24px; font-weight: bold; color: #3b82f6; }
        .celebration { font-size: 48px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="celebration">🎉</div>
          <h1>Contract Approved!</h1>
          <p>Your project is ready to begin</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${freelancer.username || freelancer.email}</strong>,</p>
          
          <p>Great news! Your contract for "<strong>${contract.project_title || contract.title}</strong>" has been approved by the client. Invoices have been automatically generated and sent to the client.</p>
          
          <h3>💰 Contract Details</h3>
          <ul>
            <li><strong>Total Amount:</strong> <span class="amount">${contract.total_amount} ${contract.token_type || 'USDC'}</span></li>
            <li><strong>Project:</strong> ${contract.project_title || contract.title}</li>
            <li><strong>Deadline:</strong> ${new Date(contract.deadline).toLocaleDateString()}</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="button">📋 View Contract Details</a>
          </div>
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li>Review the contract details and milestones</li>
            <li>Start working on your project</li>
            <li>Submit your work when ready for review</li>
            <li>Client will pay invoices as you complete milestones</li>
          </ol>
          
          <p><strong>Important:</strong> Invoices have been automatically generated and sent to the client. They can pay using cryptocurrency once you deliver the completed work. You'll be notified when payment is received.</p>
          
          <p>Good luck with your project! 🍀</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Manage your contracts and payments at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;
}