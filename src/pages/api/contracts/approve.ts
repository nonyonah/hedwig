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

  // Send notification to freelancer
  const freelancer = contract.users;
  if (freelancer?.email) {
    try {
      const emailTemplate = generateFreelancerNotificationEmailTemplate(contract, freelancer);
      await sendSimpleEmail(
        freelancer.email,
        `Contract Approved: ${contract.title}`,
        emailTemplate
      );
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
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
  const { data: contract, error: contractError } = await supabase
    .from('project_contracts')
    .select(`
      *,
      users!project_contracts_freelancer_id_fkey (
        id,
        username,
        email,
        telegram_user_id
      )
    `)
    .eq('id', contractId)
    .single();

  if (contractError || !contract) {
    return res.status(404).json({
      success: false,
      error: 'Contract not found'
    });
  }

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

  // Send notification email to freelancer
  const freelancer = contract.users;
  if (freelancer?.email) {
    try {
      const emailTemplate = generateLegacyFreelancerNotificationEmailTemplate(contract, freelancer);
      await sendSimpleEmail(
        freelancer.email,
        `Contract Approved: ${contract.title}`,
        emailTemplate
      );
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }
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
          <p>Your smart contract project is ready</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${freelancer.username || freelancer.email}</strong>,</p>
          
          <p>Great news! Your contract for "<strong>${contract.project_title || contract.title}</strong>" has been approved and the smart contract is being deployed.</p>
          
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
            <li>Submit milestones for review</li>
            <li>Receive payments automatically from the smart contract</li>
          </ol>
          
          <p><strong>Important:</strong> Payments will be released automatically from the smart contract escrow as you complete each milestone. Make sure to deliver quality work on time!</p>
          
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