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
      const supportedNetworks = ['base', 'ethereum', 'polygon', 'optimism', 'celo'];
      
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
        proposal_number: proposalNumber,
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

// Process proposal input from user messages
export async function processProposalInput(message: string, user: any): Promise<{ success: boolean; message: string }> {
  try {
    // Check if user has an ongoing proposal creation by querying user_states directly
    const { data: userState } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', user.id)
      .eq('state_type', 'creating_proposal')
      .single();
    
    if (userState?.state_data) {
      // User has ongoing proposal creation - this should be handled by the bot integration
      return { 
        success: true, 
        message: 'I see you have an ongoing proposal creation. Please continue in the Telegram bot or type "cancel proposal" to start over.' 
      };
    } else {
      // Check if user has a name, if not, ask for it first
      if (!user.name || user.name.trim() === '') {
        // Store the pending proposal message in session context
        await supabase
          .from('sessions')
          .upsert({
            user_id: user.id,
            context: [{
              role: 'system',
              content: JSON.stringify({
                waiting_for: 'name',
                pending_proposal_message: message
              })
            }]
          });
        
        return {
          success: true,
          message: "Before creating a proposal, I need to know your name for the proposal. What's your full name?"
        };
      }
      
      // Start new proposal creation with AI-powered parsing
      const proposalDetails = parseProposalFromMessage(message);
      
      if (proposalDetails.hasBasicInfo) {
        // Try to create proposal directly if we have enough info
        try {
          // Get user's wallet address - check across all networks
          const { data: wallets } = await supabase
            .from('wallets')
            .select('address, network')
            .eq('user_id', user.id);
          
          if (!wallets || wallets.length === 0) {
            return {
              success: false,
              message: "You need a wallet before creating proposals. Please type 'create wallet' to create your wallet first."
            };
          }
          
          const wallet = wallets.find(w => w.network === proposalDetails.network) || wallets[0];
          
          const proposalParams: CreateProposalParams = {
            title: proposalDetails.title || 'Professional Services Proposal',
            description: proposalDetails.description || 'Professional services as discussed',
            amount: proposalDetails.amount,
            token: proposalDetails.token || 'USDC',
            network: proposalDetails.network || wallet.network || 'base',
            walletAddress: wallet.address,
            userName: user.name,
            recipientEmail: proposalDetails.email,
            deadline: proposalDetails.deadline,
            deliverables: proposalDetails.deliverables
          };
          
          const result = await createProposal(proposalParams);
          
          if (result.success) {
            return {
              success: true,
              message: `✅ **Proposal Created Successfully!**\n\n📋 **Proposal Details:**\n• Title: ${proposalParams.title}\n• Description: ${proposalParams.description}\n${proposalParams.amount ? `• Budget: ${proposalParams.amount} ${proposalParams.token}` : ''}\n• Network: ${proposalParams.network}\n\n🔗 **Proposal Link:**\n${result.proposalLink}\n\n${proposalParams.recipientEmail ? '📧 Email sent to client!' : '💡 Share this link with your client for review.'}`
            };
          } else {
            return {
              success: false,
              message: `❌ Failed to create proposal: ${result.error}`
            };
          }
        } catch (error) {
          console.error('Error creating proposal directly:', error);
          return {
            success: false,
            message: 'Failed to create proposal. Please try again or use the step-by-step process in the Telegram bot.'
          };
        }
      } else {
        // Guide user to provide more details
        return {
          success: true,
          message: `I'll help you create a proposal! I need a few more details:\n\n📋 **Required Information:**\n• 📝 **Project Title**: What's the name of your project?\n• 📄 **Description**: Describe the work you'll do\n• 💰 **Budget**: How much will you charge? (optional)\n• 📅 **Timeline**: When will you complete it?\n• 📧 **Client Email**: Who should receive this proposal?\n\nYou can provide all details in one message like:\n"Create proposal for website redesign project, will redesign company website with modern UI, budget $2000, send to client@email.com, deadline in 4 weeks"\n\nOr I can guide you step-by-step in the Telegram bot by typing "📝 Proposal".`
        };
      }
    }
  } catch (error) {
    console.error('Error processing proposal input:', error);
    return { success: false, message: 'Failed to process proposal request. Please try again.' };
  }
}

// Helper function to parse proposal details from natural language
function parseProposalFromMessage(message: string): {
  title?: string;
  description?: string;
  amount?: number;
  token?: string;
  network?: string;
  email?: string;
  deadline?: string;
  deliverables?: string[];
  hasBasicInfo: boolean;
} {
  const result: any = {};
  
  // Parse amount
  const amountMatch = message.match(/\$?(\d+(?:\.\d{2})?)/);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1]);
  }
  
  // Parse token
  const tokenMatch = message.match(/\b(USDC|ETH|USDT|DAI|WETH|MATIC|ARB|OP)\b/i);
  if (tokenMatch) {
    result.token = tokenMatch[1].toUpperCase();
  }
  
  // Parse email
  const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }
  
  // Parse title/project name
  const titlePatterns = [
    /proposal for (.+?)(?:\s*,|\s*project|\s*will|\s*budget|\s*send|\s*deadline|\s*$)/i,
    /create proposal (.+?)(?:\s*,|\s*project|\s*will|\s*budget|\s*send|\s*deadline|\s*$)/i,
    /(.+?) project/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.title = match[1].trim();
      break;
    }
  }
  
  // Parse description
  const descriptionPatterns = [
    /will (.+?)(?:\s*,|\s*budget|\s*send|\s*deadline|\s*$)/i,
    /description[:\s]+(.+?)(?:\s*,|\s*budget|\s*send|\s*deadline|\s*$)/i,
    /project[:\s]+(.+?)(?:\s*,|\s*budget|\s*send|\s*deadline|\s*$)/i
  ];
  
  for (const pattern of descriptionPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.description = match[1].trim();
      break;
    }
  }
  
  // Parse deadline
  const deadlinePatterns = [
    /deadline in (\d+) (?:weeks?|days?)/i,
    /deadline (\d{4}-\d{2}-\d{2})/i,
    /deadline (.+?)(?:\s*$)/i,
    /in (\d+) (?:weeks?|days?)$/i
  ];
  
  for (const pattern of deadlinePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.deadline = match[1].trim();
      break;
    }
  }
  
  // Determine if we have basic info
  result.hasBasicInfo = !!(result.title || result.description || message.includes('proposal'));
  
  return result;
}