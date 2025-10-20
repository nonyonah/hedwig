import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { legalContractService, ContractGenerationRequest } from '../../../services/legalContractService';
import { sendSimpleEmail } from '../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ContractGenerationApiRequest extends NextApiRequest {
  body: ContractGenerationRequest & {
    clientId?: string;
    freelancerId?: string;
  };
}

export default async function handler(req: ContractGenerationApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      projectTitle,
      projectDescription,
      clientName,
      clientEmail,
      clientWallet,
      freelancerName,
      freelancerEmail,
      freelancerWallet,
      paymentAmount,
      tokenType,
      chain,
      deadline,
      milestones,
      refundPolicy,
      clientId,
      freelancerId
    } = req.body;

    // Validate required fields
    if (!projectTitle || !clientName || !clientWallet || !freelancerName || !freelancerWallet || !paymentAmount || !deadline || !milestones?.length) {
      return res.status(400).json({ 
        error: 'Missing required fields: projectTitle, clientName, clientWallet, freelancerName, freelancerWallet, paymentAmount, deadline, milestones' 
      });
    }

    // Generate the legal contract
    const contractResult = await legalContractService.generateContract({
      projectTitle,
      projectDescription,
      clientName,
      clientEmail,
      clientWallet,
      freelancerName,
      freelancerEmail,
      freelancerWallet,
      paymentAmount,
      tokenType: tokenType || 'USDC',
      chain: chain || 'base',
      deadline,
      milestones,
      refundPolicy
    });

    if (!contractResult.success) {
      return res.status(500).json({ error: contractResult.error });
    }

    // Generate a unique contract ID (BIGINT)
    const contractId = Date.now();

    // Create project contract entry
    const { data: projectContract, error: contractError } = await supabase
      .from('project_contracts')
      .insert({
        contract_id: contractId,
        client_id: clientId,
        freelancer_id: freelancerId,
        project_title: projectTitle,
        project_description: projectDescription,
        total_amount: paymentAmount,
        token_address: getTokenAddress(tokenType || 'USDC', chain || 'base'),
        chain: chain || 'base',
        deadline: deadline,
        status: 'created',
        legal_contract_hash: contractResult.contractId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (contractError) {
      console.error('Failed to create project contract:', contractError);
      return res.status(500).json({ error: 'Failed to create project contract' });
    }

    // Create milestones
    const milestoneInserts = milestones.map((milestone, index) => ({
      milestone_id: Date.now() + index, // Generate unique milestone ID
      contract_id: projectContract.id,
      title: milestone.title,
      description: milestone.description,
      amount: milestone.amount,
      deadline: milestone.deadline,
      status: 'pending'
    }));

    const { error: milestonesError } = await supabase
      .from('contract_milestones')
      .insert(milestoneInserts);

    if (milestonesError) {
      console.error('Failed to create milestones:', milestonesError);
      return res.status(500).json({ error: 'Failed to create milestones' });
    }

    // Send email notification to client for approval
    if (clientEmail) {
      try {
        const approvalLink = `${process.env.NEXT_PUBLIC_APP_URL}/contracts/approve/${projectContract.id}`;
        const emailHtml = generateContractApprovalEmailTemplate({
          clientName,
          projectTitle,
          freelancerName,
          paymentAmount,
          tokenType: tokenType || 'USDC',
          deadline,
          milestones,
          approvalLink,
          contractText: contractResult.contractText
        });

        await sendSimpleEmail(
          clientEmail,
          `Contract Approval Required: ${projectTitle}`,
          emailHtml
        );
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
        // Don't fail the entire request if email fails
      }
    }

    res.status(200).json({
      success: true,
      contractId: projectContract.id,
      legalContractId: contractResult.contractId,
      approvalRequired: true,
      message: 'Contract generated successfully. Client approval required.'
    });

  } catch (error) {
    console.error('Contract generation error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

function getTokenAddress(tokenType: string, chain: string): string {
  // Token addresses for different chains
  const tokenAddresses: Record<string, Record<string, string>> = {
    base: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      ETH: '0x0000000000000000000000000000000000000000'
    },
    ethereum: {
      USDC: '0xA0b86a33E6441b8C4505E2c4B8b5b8e8E8E8E8E8',
      ETH: '0x0000000000000000000000000000000000000000'
    }
  };

  return tokenAddresses[chain]?.[tokenType] || tokenAddresses.base.USDC;
}

function generateContractApprovalEmailTemplate(data: {
  clientName: string;
  projectTitle: string;
  freelancerName: string;
  paymentAmount: number;
  tokenType: string;
  deadline: string;
  milestones: Array<{ title: string; amount: number; deadline: string }>;
  approvalLink: string;
  contractText?: string;
}): string {
  const { clientName, projectTitle, freelancerName, paymentAmount, tokenType, deadline, milestones, approvalLink } = data;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Contract Approval Required</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .milestone { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 24px; font-weight: bold; color: #667eea; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🤝 Contract Approval Required</h1>
          <p>A new freelance contract is ready for your review</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${clientName}</strong>,</p>
          
          <p>A new contract has been generated for your project with <strong>${freelancerName}</strong>. Please review the details below and approve the contract to proceed.</p>
          
          <h3>📋 Project Details</h3>
          <ul>
            <li><strong>Project:</strong> ${projectTitle}</li>
            <li><strong>Freelancer:</strong> ${freelancerName}</li>
            <li><strong>Total Amount:</strong> <span class="amount">${paymentAmount} ${tokenType}</span></li>
            <li><strong>Deadline:</strong> ${new Date(deadline).toLocaleDateString()}</li>
          </ul>
          
          <h3>🎯 Milestones</h3>
          ${milestones.map((milestone, index) => `
            <div class="milestone">
              <strong>Milestone ${index + 1}: ${milestone.title}</strong><br>
              Amount: ${milestone.amount} ${tokenType}<br>
              Deadline: ${new Date(milestone.deadline).toLocaleDateString()}
            </div>
          `).join('')}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${approvalLink}" class="button">📝 Review & Approve Contract</a>
          </div>
          
          <p><strong>Important:</strong> By approving this contract, you authorize the transfer of funds to the smart contract escrow. Funds will be released to the freelancer upon milestone completion.</p>
          
          <p>If you have any questions, please contact us or reach out to ${freelancerName} directly.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>If you didn't expect this email, please ignore it.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}