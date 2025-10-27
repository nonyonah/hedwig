import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Milestone {
  title: string;
  description?: string;
  amount: number;
  due_date: string; // ISO date string
}

interface CreateContractRequest {
  freelancer_id: string;
  client_name: string;
  client_email: string;
  title: string;
  description?: string;
  total_amount: number;
  currency: string;
  allow_part_payments: boolean;
  deadline: string; // ISO date string
  milestones: Milestone[];
  source_type?: 'manual' | 'telegram' | 'dashboard';
}

interface CreateContractResponse {
  success: boolean;
  contract_id?: string;
  approval_url?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateContractResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const {
      freelancer_id,
      client_name,
      client_email,
      title,
      description,
      total_amount,
      currency = 'USDC',
      allow_part_payments = true,
      deadline,
      milestones,
      source_type = 'manual'
    }: CreateContractRequest = req.body;

    // Validate required fields
    if (!freelancer_id || !client_email || !title || !total_amount || !deadline || !milestones?.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: freelancer_id, client_email, title, total_amount, deadline, milestones'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(client_email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate milestones total matches contract total
    const milestonesTotal = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
    if (Math.abs(milestonesTotal - total_amount) > 0.01) {
      return res.status(400).json({
        success: false,
        error: 'Milestones total amount must equal contract total amount'
      });
    }

    // Verify freelancer exists
    const { data: freelancer, error: freelancerError } = await supabase
      .from('users')
      .select('id, username, email')
      .eq('id', freelancer_id)
      .single();

    if (freelancerError || !freelancer) {
      return res.status(404).json({
        success: false,
        error: 'Freelancer not found'
      });
    }

    // Generate approval token
    const approval_token = crypto.randomBytes(32).toString('base64url');
    const approval_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        freelancer_id,
        client_email: client_email.toLowerCase().trim(),
        client_name: client_name?.trim(),
        title: title.trim(),
        description: description?.trim(),
        total_amount,
        currency: currency.toUpperCase(),
        allow_part_payments,
        deadline,
        status: 'pending_approval',
        approval_token,
        approval_expires_at: approval_expires_at.toISOString(),
        source_type
      })
      .select()
      .single();

    if (contractError) {
      console.error('Error creating contract:', contractError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create contract'
      });
    }

    // Create milestones
    const milestoneInserts = milestones.map((milestone, index) => ({
      contract_id: contract.id,
      title: milestone.title.trim(),
      description: milestone.description?.trim(),
      amount: milestone.amount,
      due_date: milestone.due_date,
      order_index: index + 1
    }));

    const { error: milestonesError } = await supabase
      .from('contract_milestones')
      .insert(milestoneInserts);

    if (milestonesError) {
      console.error('Error creating milestones:', milestonesError);
      // Rollback contract creation
      await supabase.from('contracts').delete().eq('id', contract.id);
      return res.status(500).json({
        success: false,
        error: 'Failed to create contract milestones'
      });
    }

    // Generate approval URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz';
    const approveUrl = `${baseUrl}/contracts/approve/${approval_token}`;
    const declineUrl = `${baseUrl}/contracts/decline/${approval_token}`;

    // Send approval email to client
    const emailSent = await sendApprovalEmail({
      client_name: client_name || 'Client',
      client_email,
      freelancer_name: freelancer.username || freelancer.email,
      contract_title: title,
      contract_description: description,
      total_amount,
      currency,
      deadline,
      milestones,
      approve_url: approveUrl,
      decline_url: declineUrl
    });

    if (!emailSent) {
      console.warn('Failed to send approval email, but contract was created');
    }

    // Create notification record
    await supabase.from('contract_notifications').insert({
      contract_id: contract.id,
      recipient: 'client',
      notification_type: 'approval_requested',
      subject: `Contract Approval Required: ${title}`,
      message: `Please review and approve the contract "${title}" from ${freelancer.username || freelancer.email}`,
      sent_via_email: emailSent
    });

    // Create notification for freelancer
    await supabase.from('contract_notifications').insert({
      contract_id: contract.id,
      recipient: 'freelancer',
      notification_type: 'contract_created',
      subject: `Contract Created: ${title}`,
      message: `Your contract "${title}" has been created and sent to ${client_email} for approval`,
      sent_via_email: false // Will be sent via Telegram if integrated
    });

    return res.status(201).json({
      success: true,
      contract_id: contract.id,
      approval_url: approveUrl
    });

  } catch (error) {
    console.error('Error in contract creation:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function sendApprovalEmail(data: {
  client_name: string;
  client_email: string;
  freelancer_name: string;
  contract_title: string;
  contract_description?: string;
  total_amount: number;
  currency: string;
  deadline: string;
  milestones: Milestone[];
  approve_url: string;
  decline_url: string;
}): Promise<boolean> {
  const {
    client_name,
    client_email,
    freelancer_name,
    contract_title,
    contract_description,
    total_amount,
    currency,
    deadline,
    milestones,
    approve_url,
    decline_url
  } = data;

  const formattedDeadline = new Date(deadline).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const milestonesHtml = milestones.map((milestone, index) => {
    const dueDate = new Date(milestone.due_date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    return `
      <div style="background: #f8f9fa; border-left: 4px solid #10b981; padding: 15px; margin: 10px 0; border-radius: 4px;">
        <h4 style="margin: 0 0 8px 0; color: #1f2937;">${index + 1}. ${milestone.title}</h4>
        ${milestone.description ? `<p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">${milestone.description}</p>` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; color: #10b981;">${milestone.amount} ${currency}</span>
          <span style="color: #6b7280; font-size: 14px;">Due: ${dueDate}</span>
        </div>
      </div>
    `;
  }).join('');

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Contract Approval Required</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0; 
          padding: 20px; 
          background-color: #f5f5f5; 
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background: white; 
          border-radius: 8px; 
          overflow: hidden; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .header { 
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
          color: white; 
          padding: 30px; 
          text-align: center; 
        }
        .content { padding: 30px; }
        .button { 
          display: inline-block; 
          padding: 15px 30px; 
          text-decoration: none; 
          border-radius: 5px; 
          font-weight: bold; 
          margin: 10px 5px; 
          text-align: center;
        }
        .approve-btn { 
          background: #10b981; 
          color: white; 
        }
        .decline-btn { 
          background: #ef4444; 
          color: white; 
        }
        .footer { 
          background: #f8f9fa; 
          padding: 20px; 
          text-align: center; 
          font-size: 14px; 
          color: #666; 
        }
        .amount { 
          font-size: 24px; 
          font-weight: bold; 
          color: #10b981; 
        }
        .contract-details {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .action-buttons {
          text-align: center;
          margin: 30px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 Contract Approval Required</h1>
          <p>Please review the contract details below</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${client_name}</strong>,</p>
          
          <p><strong>${freelancer_name}</strong> has sent you a contract for review and approval.</p>
          
          <div class="contract-details">
            <h3 style="margin-top: 0; color: #1f2937;">📄 Contract Details</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Project:</strong> ${contract_title}</li>
              ${contract_description ? `<li><strong>Description:</strong> ${contract_description}</li>` : ''}
              <li><strong>Total Amount:</strong> <span class="amount">${total_amount} ${currency}</span></li>
              <li><strong>Deadline:</strong> ${formattedDeadline}</li>
              <li><strong>Freelancer:</strong> ${freelancer_name}</li>
            </ul>
          </div>

          <h3>🎯 Project Milestones</h3>
          ${milestonesHtml}

          <div class="action-buttons">
            <p><strong>Please review the contract and choose an action:</strong></p>
            <a href="${approve_url}" class="button approve-btn">✅ Approve Contract</a>
            <a href="${decline_url}" class="button decline-btn">❌ Decline Contract</a>
          </div>

          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #92400e;">⚠️ Important Notes:</h4>
            <ul style="margin: 0; color: #92400e;">
              <li>By approving this contract, you agree to the terms and milestone payments</li>
              <li>Invoices will be automatically generated for each milestone</li>
              <li>Payments are processed through Hedwig's secure payment system</li>
              <li>A 1% platform fee will be automatically deducted from payments</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p>This contract approval link will expire in 7 days.</p>
          <p>If you have any questions, please contact ${freelancer_name} directly.</p>
          <p>Powered by <strong>Hedwig</strong> - Secure Freelance Contracts</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    return await sendSimpleEmail(
      client_email,
      `Contract Approval Required: ${contract_title}`,
      emailHtml
    );
  } catch (error) {
    console.error('Error sending approval email:', error);
    return false;
  }
}