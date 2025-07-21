import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';

loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ProposalData {
  clientName: string;
  projectTitle: string;
  description: string;
  deliverables: string;
  timelineStart: string; // ISO date string
  timelineEnd: string; // ISO date string
  paymentAmount: number;
  paymentMethod: 'crypto' | 'bank' | 'mixed';
  serviceFee: number;
  clientEmail?: string;
}

export interface ProposalResponse {
  id: string;
  userId: string;
  clientName: string;
  projectTitle: string;
  description: string;
  deliverables: string;
  timelineStart: string;
  timelineEnd: string;
  paymentAmount: number;
  paymentMethod: string;
  serviceFee: number;
  clientEmail?: string;
  status: string;
  paymentLinkId?: string;
  proposalPdfUrl?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  expiresAt: string;
}

export interface ProposalSummary {
  proposal: ProposalResponse;
  paymentLink?: string;
  totalAmount: number;
  formattedTimeline: string;
  estimatedDuration: string;
}

export class ProposalService {
  /**
   * Create a new proposal in the database
   */
  static async createProposal(userId: string, proposalData: ProposalData): Promise<ProposalResponse> {
    const { data, error } = await supabase
      .from('proposals')
      .insert({
        user_id: userId,
        client_name: proposalData.clientName,
        project_title: proposalData.projectTitle,
        description: proposalData.description,
        deliverables: proposalData.deliverables,
        timeline_start: proposalData.timelineStart,
        timeline_end: proposalData.timelineEnd,
        payment_amount: proposalData.paymentAmount,
        payment_method: proposalData.paymentMethod,
        service_fee: proposalData.serviceFee,
        client_email: proposalData.clientEmail || null,
        status: 'draft'
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error creating proposal:', error);
      throw new Error('Failed to create proposal');
    }

    return this.formatProposalResponse(data);
  }

  /**
   * Get proposal by ID
   */
  static async getProposal(proposalId: string, userId?: string): Promise<ProposalResponse | null> {
    let query = supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return null;
    }

    return this.formatProposalResponse(data);
  }

  /**
   * Update proposal status
   */
  static async updateProposalStatus(proposalId: string, status: string, userId?: string): Promise<boolean> {
    let query = supabase
      .from('proposals')
      .update({ 
        status,
        ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {})
      })
      .eq('id', proposalId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;
    return !error;
  }

  /**
   * Add payment link to proposal
   */
  static async addPaymentLinkToProposal(proposalId: string, paymentLinkId: string, userId?: string): Promise<boolean> {
    let query = supabase
      .from('proposals')
      .update({ payment_link_id: paymentLinkId })
      .eq('id', proposalId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;
    return !error;
  }

  /**
   * Get user's proposals
   */
  static async getUserProposals(userId: string, limit: number = 20): Promise<ProposalResponse[]> {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching proposals:', error);
      return [];
    }

    return data.map(this.formatProposalResponse);
  }

  /**
   * Generate proposal summary with calculated fields
   */
  static async generateProposalSummary(proposalId: string, userId?: string): Promise<ProposalSummary | null> {
    const proposal = await this.getProposal(proposalId, userId);
    if (!proposal) return null;

    // Get payment link if exists
    let paymentLink: string | undefined;
    if (proposal.paymentLinkId) {
      const { data: paymentData } = await supabase
        .from('payment_links')
        .select('id')
        .eq('id', proposal.paymentLinkId)
        .single();

      if (paymentData) {
        paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwig.xyz'}/pay/${paymentData.id}`;
      }
    }

    // Calculate total amount
    const totalAmount = proposal.paymentAmount + proposal.serviceFee;

    // Format timeline
    const startDate = new Date(proposal.timelineStart);
    const endDate = new Date(proposal.timelineEnd);
    const formattedTimeline = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;

    // Calculate estimated duration
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const estimatedDuration = diffDays === 1 ? '1 day' : `${diffDays} days`;

    return {
      proposal,
      paymentLink,
      totalAmount,
      formattedTimeline,
      estimatedDuration
    };
  }

  /**
   * Create payment link for proposal
   */
  static async createPaymentLinkForProposal(
    proposal: ProposalResponse,
    walletAddress: string,
    userName: string,
    token: string = 'USDC',
    network: string = 'base'
  ): Promise<string | null> {
    try {
      const totalAmount = proposal.paymentAmount + proposal.serviceFee;
      
      const { data, error } = await supabase
        .from('payment_links')
        .insert({
          amount: totalAmount,
          token: token.toUpperCase(),
          network: network.toLowerCase(),
          wallet_address: walletAddress.toLowerCase(),
          user_name: userName,
          payment_reason: `Payment for: ${proposal.projectTitle}`,
          recipient_email: proposal.clientEmail || null,
          status: 'pending',
          created_by: proposal.userId
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating payment link:', error);
        return null;
      }

      // Update proposal with payment link
      await this.addPaymentLinkToProposal(proposal.id, data.id, proposal.userId);

      return `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwig.xyz'}/pay/${data.id}`;
    } catch (error) {
      console.error('Error creating payment link for proposal:', error);
      return null;
    }
  }

  /**
   * Generate proposal PDF content (HTML that can be converted to PDF)
   */
  static generateProposalHTML(summary: ProposalSummary): string {
    const { proposal, totalAmount, formattedTimeline, estimatedDuration, paymentLink } = summary;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Project Proposal - ${proposal.projectTitle}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #007bff; margin: 0; }
        .section { margin-bottom: 25px; }
        .section h2 { color: #007bff; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .info-item { background: #f8f9fa; padding: 15px; border-radius: 5px; }
        .info-item strong { color: #007bff; }
        .payment-box { background: #e7f3ff; border: 2px solid #007bff; padding: 20px; border-radius: 10px; text-align: center; }
        .payment-link { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; }
        @media print { .payment-link { background: #007bff !important; -webkit-print-color-adjust: exact; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Project Proposal</h1>
        <p><strong>${proposal.projectTitle}</strong></p>
        <p>Prepared for: ${proposal.clientName}</p>
    </div>

    <div class="section">
        <h2>Project Overview</h2>
        <p>${proposal.description}</p>
    </div>

    <div class="section">
        <h2>Deliverables</h2>
        <p>${proposal.deliverables}</p>
    </div>

    <div class="info-grid">
        <div class="info-item">
            <strong>Timeline:</strong><br>
            ${formattedTimeline}<br>
            <small>(${estimatedDuration})</small>
        </div>
        <div class="info-item">
            <strong>Payment Method:</strong><br>
            ${proposal.paymentMethod.charAt(0).toUpperCase() + proposal.paymentMethod.slice(1)}
        </div>
    </div>

    <div class="section">
        <h2>Investment Breakdown</h2>
        <div class="info-grid">
            <div class="info-item">
                <strong>Project Amount:</strong><br>
                $${proposal.paymentAmount.toLocaleString()}
            </div>
            <div class="info-item">
                <strong>Service Fee:</strong><br>
                $${proposal.serviceFee.toLocaleString()}
            </div>
        </div>
        <div class="payment-box">
            <h3>Total Investment: $${totalAmount.toLocaleString()}</h3>
            ${paymentLink ? `
                <p>Ready to proceed? Use the secure payment link below:</p>
                <a href="${paymentLink}" class="payment-link">Pay Now</a>
                <p><small>Secure crypto payment powered by Hedwig</small></p>
            ` : ''}
        </div>
    </div>

    <div class="footer">
        <p>This proposal is valid until ${new Date(proposal.expiresAt).toLocaleDateString()}</p>
        <p>Generated on ${new Date().toLocaleDateString()} via Hedwig AI Agent</p>
    </div>
</body>
</html>`;
  }

  /**
   * Format database response to ProposalResponse interface
   */
  private static formatProposalResponse(data: any): ProposalResponse {
    return {
      id: data.id,
      userId: data.user_id,
      clientName: data.client_name,
      projectTitle: data.project_title,
      description: data.description,
      deliverables: data.deliverables,
      timelineStart: data.timeline_start,
      timelineEnd: data.timeline_end,
      paymentAmount: parseFloat(data.payment_amount),
      paymentMethod: data.payment_method,
      serviceFee: parseFloat(data.service_fee),
      clientEmail: data.client_email,
      status: data.status,
      paymentLinkId: data.payment_link_id,
      proposalPdfUrl: data.proposal_pdf_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      sentAt: data.sent_at,
      expiresAt: data.expires_at
    };
  }
}

export default ProposalService;