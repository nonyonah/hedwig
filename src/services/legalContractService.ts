import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ContractGenerationRequest {
  projectTitle: string;
  projectDescription: string;
  clientName: string;
  clientEmail?: string;
  clientWallet: string;
  freelancerName: string;
  freelancerEmail?: string;
  freelancerWallet: string;
  paymentAmount: number;
  tokenType: string;
  chain: string;
  deadline: string;
  milestones: Array<{
    title: string;
    description: string;
    amount: number;
    deadline: string;
  }>;
  refundPolicy?: string;
}

export interface ContractGenerationResult {
  success: boolean;
  contractId?: string;
  contractText?: string;
  contractHash?: string;
  metadata?: {
    wordCount: number;
    generatedAt: string;
  };
  error?: string;
}

export class LegalContractService {
  /**
   * Generate a legal contract using AI
   */
  async generateContract(request: ContractGenerationRequest): Promise<ContractGenerationResult> {
    try {
      // Generate contract text using AI (placeholder implementation)
      const contractText = this.generateContractText(request);
      
      // Generate a hash for the contract
      const contractHash = await this.generateContractHash(contractText);
      
      // Generate metadata
      const metadata = {
        wordCount: contractText.split(/\s+/).length,
        generatedAt: new Date().toISOString()
      };
      
      // Store contract in database
      const { data: contract, error } = await supabase
        .from('legal_contracts')
        .insert({
          project_title: request.projectTitle,
          project_description: request.projectDescription,
          client_name: request.clientName,
          client_email: request.clientEmail,
          client_wallet: request.clientWallet,
          freelancer_name: request.freelancerName,
          freelancer_email: request.freelancerEmail,
          freelancer_wallet: request.freelancerWallet,
          payment_amount: request.paymentAmount,
          token_type: request.tokenType,
          chain: request.chain,
          deadline: request.deadline,
          milestones: request.milestones,
          refund_policy: request.refundPolicy,
          contract_text: contractText,
          contract_hash: contractHash,
          status: 'generated',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to store contract:', error);
        return {
          success: false,
          error: 'Failed to store contract in database'
        };
      }

      return {
        success: true,
        contractId: contract.id,
        contractText,
        contractHash,
        metadata
      };
    } catch (error) {
      console.error('Contract generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Store contract information in the database
   */
  async storeContract(contractId: string, contractText: string, contractHash: string, metadata?: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('legal_contracts')
        .update({
          contract_text: contractText,
          contract_hash: contractHash,
          metadata: metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', contractId);

      if (error) {
        console.error('Failed to store contract:', error);
        throw new Error('Failed to store contract in database');
      }
    } catch (error) {
      console.error('Contract storage error:', error);
      throw error;
    }
  }

  /**
   * Generate contract text (placeholder implementation)
   */
  private generateContractText(request: ContractGenerationRequest): string {
    return `
FREELANCE SERVICE AGREEMENT

Project: ${request.projectTitle}
Description: ${request.projectDescription}

PARTIES:
Client: ${request.clientName}
Wallet: ${request.clientWallet}

Freelancer: ${request.freelancerName}
Email: ${request.freelancerEmail || 'Not provided'}
Wallet: ${request.freelancerWallet}

PAYMENT TERMS:
Total Amount: ${request.paymentAmount} ${request.tokenType}
Network: ${request.chain}
Deadline: ${request.deadline}

MILESTONES:
${request.milestones.map((milestone, index) => 
  `${index + 1}. ${milestone.title}
     Description: ${milestone.description}
     Amount: ${milestone.amount} ${request.tokenType}
     Deadline: ${milestone.deadline}`
).join('\n\n')}

REFUND POLICY:
${request.refundPolicy || 'Standard refund policy applies'}

This contract is governed by the terms and conditions of the Hedwig platform.
Generated on: ${new Date().toISOString()}
    `.trim();
  }

  /**
   * Generate a hash for the contract text
   */
  private async generateContractHash(contractText: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(contractText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

export const legalContractService = new LegalContractService();