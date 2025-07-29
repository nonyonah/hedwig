import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // TODO: Send email if recipientEmail is provided
    if (recipientEmail) {
      try {
        // Email sending logic would go here
        console.log(`Proposal email would be sent to ${recipientEmail} for proposal ${proposalLink}`);
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