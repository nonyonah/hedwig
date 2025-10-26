import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ContractNotificationService } from '../../../services/contractNotificationService';
// Keep sendSimpleEmail for legacy contract approval function
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
  invoiceId?: string | null;
}

interface LegalContract {
  id: string;
  freelancer_name?: string;
  freelancer_email?: string;
  freelancer_wallet?: string;
  client_name?: string;
  client_wallet?: string;
  token_type?: string;
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
        telegram_user_id
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

  // Send notification to freelancer using the new notification service
  try {
    const notificationService = new ContractNotificationService();
    await notificationService.sendContractApprovalNotification({
      contractId: contract.id,
      freelancerId: contract.freelancer_id,
      clientEmail: contract.client_email || '',
      clientName: contract.client_name || 'Client',
      contractTitle: contract.title,
      contractDescription: contract.description,
      totalAmount: contract.total_amount,
      currency: contract.currency || 'USD'
    });
  } catch (notificationError) {
    console.error('Failed to send contract approval notification:', notificationError);
    // Don't fail the approval if notification fails
  }

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
  const { contractId, signature, message, clientAddress } = req.body;

  if (!contractId) {
    return res.status(400).json({
      success: false,
      error: 'Contract ID is required'
    });
  }

  console.log('[Contract Approval] Looking for contract ID:', contractId);

  // Try to fetch contract from project_contracts table first
  let { data: contract, error: contractError } = await supabase
    .from('project_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  console.log('[Contract Approval] Project contracts query result:', { contract, contractError });

  // If not found in project_contracts, try the contracts table (Contracts 2.0)
  if (contractError || !contract) {
    console.log('[Contract Approval] Trying contracts table...');
    const { data: contract2, error: contractError2 } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    console.log('[Contract Approval] Contracts table query result:', { contract2, contractError2 });

    if (contract2) {
      contract = contract2;
      contractError = contractError2;
    }
  }

  // Fetch freelancer details separately
  let freelancerInfo: any = null;
  if (contract?.freelancer_id) {
    console.log('[Contract Approval] Fetching freelancer info for ID:', contract.freelancer_id);
    const { data: freelancer } = await supabase
      .from('auth.users')
      .select('id, email, raw_user_meta_data')
      .eq('id', contract.freelancer_id)
      .single();

    freelancerInfo = freelancer;
    console.log('[Contract Approval] Freelancer info from auth.users:', freelancerInfo);
  }

  // If freelancer not found in auth.users, try to get info from legal contract
  if (!freelancerInfo && contract?.legal_contract_id) {
    console.log('[Contract Approval] Fetching freelancer info from legal contract:', contract.legal_contract_id);
    const { data: legalContract } = await supabase
      .from('legal_contracts')
      .select('freelancer_name, freelancer_email')
      .eq('id', contract.legal_contract_id)
      .single();

    if (legalContract) {
      freelancerInfo = {
        email: legalContract.freelancer_email,
        raw_user_meta_data: { name: legalContract.freelancer_name }
      };
      console.log('[Contract Approval] Freelancer info from legal contract:', freelancerInfo);
    }
  }

  if (contractError || !contract) {
    console.error('[Contract Approval] Contract not found:', { contractId, contractError });
    return res.status(404).json({
      success: false,
      error: `Contract not found: ${contractError?.message || 'Unknown error'}`
    });
  }

  if (contract.status === 'approved') {
    return res.status(400).json({
      success: false,
      error: 'Contract is already approved'
    });
  }

  // Update contract status to approved and try to store signature info
  const updateData: any = {
    status: 'approved',
    approved_at: new Date().toISOString()
  };

  // Try to add signature fields (will be ignored if columns don't exist yet)
  try {
    if (signature) updateData.approval_signature = signature;
    if (message) updateData.approval_message = message;
    if (clientAddress) updateData.client_wallet = clientAddress;
  } catch (e) {
    console.log('[Contract Approval] Signature columns not available yet, skipping signature storage');
  }

  const { error: updateError } = await supabase
    .from('project_contracts')
    .update(updateData)
    .eq('id', contractId);

  if (updateError) {
    console.error('Error updating legacy contract:', updateError);
    return res.status(500).json({
      success: false,
      error: 'Failed to approve contract'
    });
  }

  // Generate invoice for the contract
  let invoiceId = null;
  try {
    invoiceId = await generateContractInvoice(contract, freelancerInfo);
  } catch (invoiceError) {
    console.error('Error generating invoice:', invoiceError);
    // Don't fail the approval if invoice generation fails
  }

  // Send notification email to freelancer
  if (freelancerInfo?.email) {
    try {
      const emailTemplate = generateLegacyFreelancerNotificationEmailTemplate(contract, freelancerInfo);
      await sendSimpleEmail(
        freelancerInfo.email,
        `Contract Approved: ${contract.project_title || contract.title}`,
        emailTemplate
      );
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }
  }

  // Send Telegram notification to freelancer
  if (contract.freelancer_id) {
    try {
      // Get freelancer's Telegram chat ID
      const { data: freelancerUser } = await supabase
        .from('users')
        .select('telegram_chat_id, first_name, last_name')
        .eq('id', contract.freelancer_id)
        .single();

      if (freelancerUser?.telegram_chat_id) {
        const telegramMessage = `🎉 *Contract Approved!*

Hello ${freelancerUser.first_name || 'there'}! Great news!

📋 *Contract:* "${contract.project_title || contract.title}"
💰 *Value:* ${contract.total_amount} ${contract.token_type || 'USDC'}
✅ *Status:* Approved by client

*What's next:*
• An invoice has been generated and sent to the client
• You'll get payment notifications when they pay
• Focus on delivering great work!

Keep up the excellent work! 🚀`;

        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: freelancerUser.telegram_chat_id,
            text: telegramMessage,
            parse_mode: 'Markdown'
          })
        });

        if (!response.ok) {
          throw new Error(`Telegram API error: ${response.statusText}`);
        }

        console.log('Telegram notification sent successfully to freelancer');
      }
    } catch (telegramError) {
      console.error('Failed to send Telegram notification:', telegramError);
      // Don't fail the approval if Telegram notification fails
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Contract approved successfully',
    invoiceId: invoiceId || undefined,
    contract: {
      id: contract.id,
      status: 'approved',
      approved_at: new Date().toISOString()
    }
  });
}

// Generate invoice for approved contract
async function generateContractInvoice(contract: any, freelancerInfo: any) {
  try {
    // Create invoice data based on contract
    const invoiceData = {
      freelancer_id: contract.freelancer_id,
      client_email: contract.client_email,
      client_name: contract.client_name || 'Client',
      project_title: contract.project_title,
      project_description: contract.project_description,
      total_amount: contract.total_amount,
      currency: contract.token_type || contract.currency || 'USDC',
      chain: contract.chain || 'base',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      status: 'sent',
      contract_id: contract.id,
      items: [
        {
          description: contract.project_title,
          quantity: 1,
          rate: contract.total_amount,
          amount: contract.total_amount
        }
      ]
    };

    // Use the existing invoice creation API which handles the schema correctly
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/create-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        freelancer_id: invoiceData.freelancer_id,
        client_email: invoiceData.client_email,
        client_name: invoiceData.client_name,
        project_title: invoiceData.project_title,
        project_description: invoiceData.project_description,
        total_amount: invoiceData.total_amount,
        currency: invoiceData.currency,
        blockchain: invoiceData.chain,
        due_date: invoiceData.due_date,
        status: invoiceData.status,
        items: invoiceData.items,
        project_contract_id: invoiceData.contract_id
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create invoice via API: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    const invoice = { id: result.invoiceId };

    if (!invoice?.id) {
      throw new Error('Invoice creation succeeded but no invoice ID returned');
    }

    console.log('Invoice generated successfully:', invoice.id);
    return invoice.id;
  } catch (error) {
    console.error('Error in generateContractInvoice:', error);
    throw error;
  }
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

// Generate email template for Contracts 2.0 freelancer notification
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
          <p>Hello <strong>${freelancer.raw_user_meta_data?.name || freelancer.email}</strong>,</p>
          
          <p>Great news! Your contract for "<strong>${contract.project_title || contract.title}</strong>" has been approved by the client. An invoice has been automatically generated and sent to the client for payment.</p>
          
          <h3>💰 Contract Details</h3>
          <ul>
            <li><strong>Total Amount:</strong> <span class="amount">${contract.total_amount} ${contract.token_type || contract.currency || 'USDC'}</span></li>
            <li><strong>Client:</strong> ${contract.client_name || contract.client_email}</li>
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
            <li>Client will pay the invoice once you complete the work</li>
          </ol>
          
          <p><strong>Important:</strong> An invoice has been automatically generated and sent to the client. They can pay using cryptocurrency once you deliver the completed work. You'll be notified when payment is received.</p>
          
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
          <p>Your smart contract project is ready</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${freelancer.raw_user_meta_data?.name || freelancer.email}</strong>,</p>
          
          <p>Great news! Your contract for "<strong>${contract.project_title || contract.title}</strong>" has been approved by the client. An invoice has been automatically generated and sent to the client.</p>
          
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
            <li>Client will pay the invoice once you complete the work</li>
          </ol>
          
          <p><strong>Important:</strong> An invoice has been automatically generated and sent to the client. They can pay using cryptocurrency once you deliver the completed work. You'll be notified when payment is received.</p>
          
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