import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DeclineResponse {
  success: boolean;
  message?: string;
  contract?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<DeclineResponse>
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const approval_token = req.method === 'GET' 
      ? req.query.token as string 
      : req.body.approval_token;

    const decline_reason = req.method === 'GET'
      ? req.query.reason as string || 'No reason provided'
      : req.body.decline_reason || 'No reason provided';

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

    // Check if already processed
    if (contract.status === 'approved') {
      return res.status(400).json({ 
        success: false, 
        error: 'Contract has already been approved' 
      });
    }

    if (contract.status === 'rejected') {
      return res.status(400).json({ 
        success: false, 
        error: 'Contract has already been declined' 
      });
    }

    // Update contract status to rejected
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({ 
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: decline_reason,
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
        error: 'Failed to decline contract' 
      });
    }

    // Send notification to freelancer
    const freelancer = contract.users;
    if (freelancer?.email) {
      try {
        const emailTemplate = generateFreelancerDeclineNotificationEmailTemplate(contract, freelancer, decline_reason);
        await sendSimpleEmail(
          freelancer.email,
          `Contract Declined: ${contract.title}`,
          emailTemplate
        );
      } catch (emailError) {
        console.error('Failed to send decline notification email:', emailError);
      }
    }

    // Create notification records
    await supabase.from('contract_notifications').insert([
      {
        contract_id: contract.id,
        recipient: 'freelancer',
        notification_type: 'contract_declined',
        subject: `Contract Declined: ${contract.title}`,
        message: `Your contract "${contract.title}" has been declined by the client. Reason: ${decline_reason}`,
        sent_via_email: true
      },
      {
        contract_id: contract.id,
        recipient: 'client',
        notification_type: 'contract_declined',
        subject: `Contract Declined: ${contract.title}`,
        message: `You have declined the contract "${contract.title}". Reason: ${decline_reason}`,
        sent_via_email: false
      }
    ]);

    // For GET requests (direct link clicks), redirect to decline confirmation page
    if (req.method === 'GET') {
      const declineUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/declined?id=${contract.id}`;
      return res.redirect(302, declineUrl);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Contract declined successfully',
      contract: updatedContract
    });

  } catch (error) {
    console.error('Error in contract decline:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

// Generate email template for freelancer decline notification
function generateFreelancerDeclineNotificationEmailTemplate(contract: any, freelancer: any, reason: string): string {
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
        .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 24px; font-weight: bold; color: #ef4444; }
        .reason-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .sad-emoji { font-size: 48px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="sad-emoji">😔</div>
          <h1>Contract Declined</h1>
          <p>Your proposal was not accepted</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${freelancer.username || freelancer.email}</strong>,</p>
          
          <p>Unfortunately, your contract proposal for "<strong>${contract.title}</strong>" has been declined by the client.</p>
          
          <h3>📋 Contract Details</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${contract.total_amount} ${contract.currency}</span></li>
            <li><strong>Client:</strong> ${contract.client_name || contract.client_email}</li>
            <li><strong>Declined on:</strong> ${new Date().toLocaleDateString()}</li>
          </ul>
          
          ${reason !== 'No reason provided' ? `
          <h3>💬 Decline Reason</h3>
          <div class="reason-box">
            <strong>Client's feedback:</strong><br>
            "${reason}"
          </div>
          ` : ''}
          
          <h3>🚀 What's Next?</h3>
          <ul>
            <li>Review the client's feedback if provided</li>
            <li>Consider revising your proposal based on their requirements</li>
            <li>You can create a new contract with updated terms</li>
            <li>Reach out to the client directly if you have questions</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/dashboard" class="button">📊 Go to Dashboard</a>
          </div>
          
          <p><strong>Don't get discouraged!</strong> Contract negotiations are a normal part of freelancing. Use this feedback to improve your next proposal.</p>
          
          <p>If you have any questions or need support, feel free to reach out to our team.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Create new contracts and manage your freelance business at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;
}