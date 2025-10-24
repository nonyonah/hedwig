import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';
import { hedwigProjectContractService } from '../../../services/hedwigProjectContractService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ContractApprovalRequest extends NextApiRequest {
  body: {
    contractId: string;
    transactionHash?: string;
    smartContractAddress?: string;
  };
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

export default async function handler(req: ContractApprovalRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contractId, transactionHash, smartContractAddress } = req.body;
    console.log('[Contract Approve] Processing approval for contract:', contractId);

    if (!contractId) {
      return res.status(400).json({ error: 'Contract ID is required' });
    }

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select(`
        *,
        milestones:contract_milestones(*)
      `)
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      console.error('Contract fetch error:', contractError);
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Fetch legal contract separately if needed
    let legalContract: LegalContract | null = null;
    if (contract.legal_contract_hash) {
      const { data: legalData } = await supabase
        .from('legal_contracts')
        .select('*')
        .eq('id', contract.legal_contract_hash)
        .single();

      legalContract = legalData;
    }

    console.log('[Contract Approve] Contract found with status:', contract.status);

    if (contract.status !== 'pending_approval' && contract.status !== 'created') {
      console.log('[Contract Approve] Contract status not valid for approval:', contract.status);
      return res.status(400).json({ error: 'Contract is not available for approval' });
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

    // Handle contract approval - either from frontend transaction or backend creation
    try {
      if (transactionHash && smartContractAddress) {
        // Frontend transaction case - user already sent transaction
        console.log('[Contract Approve] Frontend transaction received:', {
          transactionHash,
          smartContractAddress,
          chain: contract.chain
        });

        // Update contract with transaction details and active status
        await supabase
          .from('project_contracts')
          .update({
            smart_contract_address: smartContractAddress,
            transaction_hash: transactionHash,
            status: 'active'
          })
          .eq('id', contractId);

        console.log('[Contract Approve] Contract activated with frontend transaction');
      } else {
        // Backend creation case - create project via service (fallback)
        console.log('[Contract Approve] Creating project via backend service:', {
          client: legalContract?.client_wallet,
          freelancer: legalContract?.freelancer_wallet,
          chain: contract.chain
        });

        // Check if we have the required wallet addresses
        if (!legalContract?.client_wallet || !legalContract?.freelancer_wallet) {
          console.error('[Contract Approve] Missing wallet addresses:', {
            hasClientWallet: !!legalContract?.client_wallet,
            hasFreelancerWallet: !!legalContract?.freelancer_wallet
          });

          // Update contract status to indicate missing wallet info
          await supabase
            .from('project_contracts')
            .update({
              status: 'deployment_pending',
              deployment_error: 'Missing wallet addresses'
            })
            .eq('id', contractId);

          console.log('[Contract Approve] Contract approved but missing wallet addresses - marked as deployment_pending');

          // Skip deployment but continue with approval
          res.status(200).json({
            success: true,
            message: 'Contract approved successfully (deployment pending - missing wallet addresses)',
            contractId: contractId
          });
          return;
        }

        // Determine if we should use testnet (Base Sepolia for testing)
        const isTestnet = contract.chain === 'base'; // Use testnet for Base as requested

        // Get token address
        const getTokenAddress = (tokenType: string, chain: string): string => {
          const tokenAddresses: Record<string, Record<string, string>> = {
            base: {
              USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              ETH: '0x0000000000000000000000000000000000000000'
            },
            celo: {
              cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
              CELO: '0x0000000000000000000000000000000000000000'
            }
          };
          return tokenAddresses[chain]?.[tokenType] || tokenAddresses.base.USDC;
        };

        // Convert amount to wei (assuming it's in token units)
        const amountInWei = (contract.total_amount * Math.pow(10, 6)).toString(); // USDC has 6 decimals

        // Create project in Hedwig contract
        const projectResult = await hedwigProjectContractService.createProject(
          {
            client: legalContract.client_wallet,
            freelancer: legalContract.freelancer_wallet,
            amount: amountInWei,
            token: getTokenAddress(legalContract.token_type || 'USDC', contract.chain),
            deadline: Math.floor(new Date(contract.deadline).getTime() / 1000), // Convert to unix timestamp
            projectTitle: contract.project_title,
            projectDescription: contract.project_description || ''
          },
          contract.chain,
          isTestnet
        );

        if (!projectResult.success) {
          console.error('Hedwig project creation failed:', projectResult.error);

          // Update contract status to indicate deployment is pending
          await supabase
            .from('project_contracts')
            .update({
              status: 'deployment_pending',
              deployment_error: projectResult.error || 'Project creation failed'
            })
            .eq('id', contractId);

          console.log('[Contract Approve] Contract approved but project creation failed - marked as deployment_pending');
        } else {
          console.log('Hedwig project created successfully:', projectResult);

          // Update contract with project details and active status
          await supabase
            .from('project_contracts')
            .update({
              smart_contract_address: projectResult.contractAddress,
              blockchain_project_id: projectResult.projectId,
              transaction_hash: projectResult.transactionHash,
              status: 'active'
            })
            .eq('id', contractId);

          console.log('[Contract Approve] Contract activated with project ID:', projectResult.projectId);
        }
      }
    } catch (deployError) {
      console.error('Contract approval error:', deployError);

      // Update contract status to indicate deployment is pending
      await supabase
        .from('project_contracts')
        .update({
          status: 'deployment_pending',
          deployment_error: deployError instanceof Error ? deployError.message : 'Unknown error'
        })
        .eq('id', contractId);
    }

    // Send notification to freelancer
    if (legalContract?.freelancer_email) {
      try {
        const emailHtml = generateFreelancerNotificationEmailTemplate({
          freelancerName: legalContract.freelancer_name || 'Freelancer',
          clientName: legalContract.client_name || 'Client',
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