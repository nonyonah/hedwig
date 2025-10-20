import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ContractApprovalRequest extends NextApiRequest {
  body: {
    contractId: string;
  };
}

export default async function handler(req: ContractApprovalRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contractId } = req.body;

    if (!contractId) {
      return res.status(400).json({ error: 'Contract ID is required' });
    }

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select(`
        *,
        milestones:contract_milestones(*),
        legal_contract:legal_contracts(*)
      `)
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.status !== 'pending_approval') {
      return res.status(400).json({ error: 'Contract is not pending approval' });
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
      console.error('Failed to update contract status:', updateError);
      return res.status(500).json({ error: 'Failed to approve contract' });
    }

    // Deploy smart contract (call existing deployment service)
    try {
      const deploymentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/contracts/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.HEDWIG_API_KEY}`
        },
        body: JSON.stringify({
          type: 'project',
          contractId: contractId,
          clientWallet: contract.client_wallet || '',
          freelancerWallet: contract.freelancer_wallet || '',
          totalAmount: contract.total_amount,
          tokenAddress: contract.token_address,
          chain: contract.chain,
          milestones: contract.milestones
        })
      });

      if (!deploymentResponse.ok) {
        console.error('Smart contract deployment failed');
        // Don't fail the approval, but log the error
      }
    } catch (deployError) {
      console.error('Smart contract deployment error:', deployError);
      // Don't fail the approval, but log the error
    }

    // Send notification to freelancer
    const legalContract = contract.legal_contract?.[0];
    if (legalContract?.freelancer_email) {
      try {
        const emailHtml = generateFreelancerNotificationEmailTemplate({
          freelancerName: legalContract.freelancer_name,
          clientName: legalContract.client_name,
          projectTitle: contract.project_title,
          totalAmount: contract.total_amount,
          tokenType: legalContract.token_type || 'USDC',
          milestones: contract.milestones,
          contractLink: `${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contractId}`
        });

        await sendSimpleEmail(
          legalContract.freelancer_email,
          `🎉 Contract Approved: ${contract.project_title}`,
          emailHtml
        );
      } catch (emailError) {
        console.error('Failed to send freelancer notification:', emailError);
        // Don't fail the approval if email fails
      }
    }

    // Send Telegram notification to freelancer if available
    try {
      await sendFreelancerTelegramNotification({
        freelancerEmail: legalContract?.freelancer_email,
        projectTitle: contract.project_title,
        clientName: legalContract?.client_name,
        totalAmount: contract.total_amount,
        tokenType: legalContract?.token_type || 'USDC'
      });
    } catch (telegramError) {
      console.error('Failed to send Telegram notification:', telegramError);
      // Don't fail the approval if Telegram fails
    }

    res.status(200).json({
      success: true,
      message: 'Contract approved successfully',
      contractId: contractId
    });

  } catch (error) {
    console.error('Contract approval error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

async function sendFreelancerTelegramNotification(data: {
  freelancerEmail?: string;
  projectTitle: string;
  clientName?: string;
  totalAmount: number;
  tokenType: string;
}) {
  if (!data.freelancerEmail) return;

  try {
    // Get user's Telegram chat ID from database
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('email', data.freelancerEmail)
      .single();

    if (!user?.telegram_chat_id) return;

    const message = `🎉 *Contract Approved!*

Your contract for "${data.projectTitle}" has been approved by ${data.clientName || 'the client'}.

💰 Total Amount: ${data.totalAmount} ${data.tokenType}

The smart contract is being deployed and you'll receive milestone payments as you complete the work. Good luck with your project! 🚀`;

    // Send Telegram message using the bot API
    const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: user.telegram_chat_id,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!telegramResponse.ok) {
      console.error('Failed to send Telegram message');
    }
  } catch (error) {
    console.error('Telegram notification error:', error);
  }
}

function generateFreelancerNotificationEmailTemplate(data: {
  freelancerName: string;
  clientName: string;
  projectTitle: string;
  totalAmount: number;
  tokenType: string;
  milestones: Array<{ title: string; amount: number; deadline: string }>;
  contractLink: string;
}): string {
  const { freelancerName, clientName, projectTitle, totalAmount, tokenType, milestones, contractLink } = data;
  
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
        .milestone { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 10px 0; border-radius: 4px; }
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
          <p>Hello <strong>${freelancerName}</strong>,</p>
          
          <p>Great news! <strong>${clientName}</strong> has approved your contract for "<strong>${projectTitle}</strong>". The smart contract is being deployed and you can start working on the project.</p>
          
          <h3>💰 Payment Details</h3>
          <ul>
            <li><strong>Total Amount:</strong> <span class="amount">${totalAmount} ${tokenType}</span></li>
            <li><strong>Client:</strong> ${clientName}</li>
            <li><strong>Project:</strong> ${projectTitle}</li>
          </ul>
          
          <h3>🎯 Your Milestones</h3>
          ${milestones.map((milestone, index) => `
            <div class="milestone">
              <strong>Milestone ${index + 1}: ${milestone.title}</strong><br>
              Payment: ${milestone.amount} ${tokenType}<br>
              Deadline: ${new Date(milestone.deadline).toLocaleDateString()}
            </div>
          `).join('')}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${contractLink}" class="button">📋 View Contract Details</a>
          </div>
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li>Review the contract details and milestones</li>
            <li>Start working on the first milestone</li>
            <li>Submit your work when ready for review</li>
            <li>Receive payment automatically upon approval</li>
          </ol>
          
          <p><strong>Important:</strong> Payments will be released automatically from the smart contract escrow as you complete each milestone. Make sure to deliver quality work on time!</p>
          
          <p>If you have any questions about the project, feel free to reach out to ${clientName} or contact our support team.</p>
          
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