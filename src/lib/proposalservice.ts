import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from '@/lib/serverEnv';
import { Resend } from 'resend';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export interface CreateProposalParams {
  title: string;
  description: string;
  amount?: number;
  token?: string;
  network?: string;
  walletAddress: string;
  userName: string;
  recipientEmail?: string;
  deadline?: string;
  deliverables?: string[];
  milestones?: Array<{
    title: string;
    description: string;
    amount?: number;
    dueDate?: string;
  }>;
}

export interface CreateProposalResult {
  success: boolean;
  proposalLink?: string;
  id?: string;
  error?: string;
}

export interface ProposalListItem {
  id: string;
  project_title: string;
  description: string;
  budget: number;
  currency: string;
  status: string;
  client_name: string;
  client_email: string;
  created_at: string;
  timeline: string;
}

export async function listProposals(userIdentifier?: string): Promise<{ success: boolean; proposals?: ProposalListItem[]; error?: string }> {
  try {
    let query = supabase
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false });

    // If userIdentifier is provided, filter by it
    if (userIdentifier) {
      query = query.eq('user_identifier', userIdentifier);
    }

    const { data: proposals, error: proposalsError } = await query;

    if (proposalsError) {
      console.error('Error fetching proposals:', proposalsError);
      return { success: false, error: 'Failed to fetch proposals' };
    }

    const proposalList: ProposalListItem[] = (proposals || []).map(proposal => ({
      id: proposal.id,
      project_title: proposal.project_title || 'Untitled Project',
      description: proposal.description,
      budget: Number(proposal.budget) || 0,
      currency: proposal.currency || 'USD',
      status: proposal.status,
      client_name: proposal.client_name || 'Unknown Client',
      client_email: proposal.client_email || '',
      created_at: proposal.created_at,
      timeline: proposal.timeline || 'Not specified'
    }));

    return { success: true, proposals: proposalList };
  } catch (error) {
    console.error('Error listing proposals:', error);
    return { success: false, error: 'Internal server error' };
  }
}

export async function createProposal(params: CreateProposalParams): Promise<CreateProposalResult> {
  const {
    title,
    description,
    amount,
    token,
    network,
    walletAddress,
    userName,
    recipientEmail,
    deadline,
    deliverables,
    milestones
  } = params;

  try {
    // Validate required fields
    if (!title || !description || !walletAddress || !userName) {
      return {
        success: false,
        error: 'Missing required fields: title, description, walletAddress, userName'
      };
    }

    // Validate amount is positive if provided
    if (amount && amount <= 0) {
      return {
        success: false,
        error: 'Amount must be greater than 0'
      };
    }

    // Validate wallet address format (basic Ethereum address validation)
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return {
        success: false,
        error: 'Invalid wallet address format'
      };
    }

    // Validate email format if provided
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return {
        success: false,
        error: 'Invalid email format'
      };
    }

    // Validate network if provided
    if (network) {
      const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism-sepolia', 'celo-alfajores'];
      
      if (!supportedNetworks.includes(network.toLowerCase())) {
        return {
          success: false,
          error: `Unsupported network. Supported networks: ${supportedNetworks.join(', ')}`
        };
      }
    }

    // Validate token if provided
    if (token) {
      const supportedTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'MATIC', 'ARB', 'OP'];
      if (!supportedTokens.includes(token.toUpperCase())) {
        return {
          success: false,
          error: `Unsupported token. Supported tokens: ${supportedTokens.join(', ')}`
        };
      }
    }

    // Generate proposal number
    const proposalNumber = `PROP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Generate a user identifier (we'll use a UUID for now)
    const userIdentifier = crypto.randomUUID();

    // Insert proposal into database
    const { data, error } = await supabase
      .from('proposals')
      .insert({
        client_name: 'Client',
        client_email: recipientEmail || 'noreply@hedwigbot.xyz',
        service_type: 'Custom Service',
        project_title: title,
        description: description,
        deliverables: deliverables || [description],
        timeline: deadline || 'To be discussed',
        budget: amount || 0,
        currency: token || 'USD',
        features: milestones ? milestones.map(m => m.title) : [],
        status: 'draft',
        user_identifier: userIdentifier
      })
      .select('id')
      .single();

    if (error) {
      console.error('Database error:', error);
      return {
        success: false,
        error: 'Failed to create proposal'
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const proposalLink = `${baseUrl}/proposal/${data.id}`;

    // Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        await sendProposalEmail({
          recipientEmail,
          title,
          description,
          amount,
          token,
          network,
          proposalLink,
          freelancerName: userName,
          deadline,
          deliverables,
          milestones
        });
        console.log(`Proposal email sent to ${recipientEmail}`);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the request if email fails, just log it
      }
    }

    return {
      success: true,
      proposalLink,
      id: data.id
    };

  } catch (error) {
    console.error('Proposal creation error:', error);
    return {
      success: false,
      error: 'Internal server error'
    };
  }
}

interface SendProposalEmailParams {
  recipientEmail: string;
  title: string;
  description: string;
  amount?: number;
  token?: string;
  network?: string;
  proposalLink: string;
  freelancerName: string;
  deadline?: string;
  deliverables?: string[];
  milestones?: Array<{
    title: string;
    description: string;
    amount?: number;
    dueDate?: string;
  }>;
}

async function sendProposalEmail(params: SendProposalEmailParams): Promise<void> {
  const { recipientEmail, title, description, amount, token, network, proposalLink, freelancerName, deadline, deliverables, milestones } = params;

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  // Get user data for personalized sender email
  const { data: userData } = await supabase
    .from('users')
    .select('email, name')
    .eq('name', freelancerName)
    .single();

  const senderEmail = userData?.email || 'noreply@hedwigbot.xyz';
  const displayName = userData?.name || freelancerName;

  const deliverablesHtml = deliverables && deliverables.length > 0 
    ? `<div class="section">
         <h4>Deliverables:</h4>
         <ul>${deliverables.map(item => `<li>${item}</li>`).join('')}</ul>
       </div>`
    : '';

  const milestonesHtml = milestones && milestones.length > 0
    ? `<div class="section">
         <h4>Milestones:</h4>
         ${milestones.map(milestone => `
           <div class="milestone">
             <strong>${milestone.title}</strong>
             <p>${milestone.description}</p>
             ${milestone.amount ? `<p>Amount: ${milestone.amount} ${token || 'USD'}</p>` : ''}
             ${milestone.dueDate ? `<p>Due: ${new Date(milestone.dueDate).toLocaleDateString()}</p>` : ''}
           </div>
         `).join('')}
       </div>`
    : '';

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Project Proposal: ${title}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6f42c1 0%, #e83e8c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .proposal-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6f42c1; }
        .section { margin: 15px 0; }
        .milestone { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 5px; border-left: 3px solid #6f42c1; }
        .button { display: inline-block; background: #6f42c1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .security-notice { background: #e7e3ff; border: 1px solid #d1c4e9; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📋 Project Proposal</h1>
        <h2>${title}</h2>
        <p>Proposal from ${displayName}</p>
      </div>
      
      <div class="content">
        <div class="proposal-details">
          <h3>Proposal Details</h3>
          <p><strong>From:</strong> ${displayName} (${senderEmail})</p>
          <p><strong>Project:</strong> ${title}</p>
          <div class="section">
            <h4>Description:</h4>
            <p>${description}</p>
          </div>
          ${amount && token ? `<p><strong>Budget:</strong> ${amount} ${token.toUpperCase()}</p>` : ''}
          ${network ? `<p><strong>Network:</strong> ${network.toUpperCase()}</p>` : ''}
          ${deadline ? `<p><strong>Deadline:</strong> ${new Date(deadline).toLocaleDateString()}</p>` : ''}
          ${deliverablesHtml}
          ${milestonesHtml}
        </div>
        
        <div class="security-notice">
          <p><strong>📋 Professional Proposal:</strong> This is an official project proposal. Please review all details carefully before proceeding.</p>
        </div>
        
        <div style="text-align: center;">
          <a href="${proposalLink}" class="button">View Full Proposal</a>
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">${proposalLink}</p>
      </div>
      
      <div class="footer">
        <p>This proposal was sent via Hedwig Bot</p>
        <p>If you have any questions about this proposal, please contact ${displayName} directly.</p>
      </div>
    </body>
    </html>
  `;

  const result = await resend.emails.send({
    from: `${displayName} <${senderEmail}>`,
    to: recipientEmail,
    subject: `Project Proposal: ${title}`,
    html: emailHtml
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }
}