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
      // Generate contract text using Gemini AI
      const contractText = await this.generateContractTextWithAI(request);
      
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

      // Generate a unique contract ID (BIGINT)
      const contractId = Date.now();

      // Create project contract entry
      const { data: projectContract, error: contractError } = await supabase
        .from('project_contracts')
        .insert({
          contract_id: contractId,
          project_title: request.projectTitle,
          project_description: request.projectDescription,
          total_amount: request.paymentAmount,
          token_address: this.getTokenAddress(request.tokenType, request.chain),
          chain: request.chain,
          deadline: request.deadline,
          status: 'created',
          legal_contract_hash: contract.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (contractError) {
        console.error('Failed to create project contract:', contractError);
        return {
          success: false,
          error: 'Failed to create project contract'
        };
      }

      // Create milestones
      if (request.milestones && request.milestones.length > 0) {
        const milestoneInserts = request.milestones.map((milestone, index) => ({
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
          return {
            success: false,
            error: 'Failed to create milestones'
          };
        }
      }

      return {
        success: true,
        contractId: projectContract.id, // Return the project contract ID instead of legal contract ID
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
      // First check if a record with this contract_hash already exists
      const { data: existingContract } = await supabase
        .from('legal_contracts')
        .select('id')
        .eq('contract_hash', contractHash)
        .single();

      if (existingContract) {
        // Update existing record (without metadata field since table doesn't have it)
        const { error } = await supabase
          .from('legal_contracts')
          .update({
            contract_text: contractText,
            contract_hash: contractHash,
            updated_at: new Date().toISOString()
          })
          .eq('contract_hash', contractHash);

        if (error) {
          console.error('Failed to update contract:', error);
          throw new Error('Failed to update contract in database');
        }
      } else {
        // This method is being called to store additional contract data
        // but the legal_contracts table expects a full contract record
        // For now, we'll skip storing since the contract data is already in project_contracts
        console.log('Skipping legal_contracts storage - contract data already in project_contracts');
      }
    } catch (error) {
      console.error('Contract storage error:', error);
      throw error;
    }
  }

  /**
   * Generate contract text using Gemini AI
   */
  private async generateContractTextWithAI(request: ContractGenerationRequest): Promise<string> {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

      const prompt = `Generate a professional freelance service agreement contract based on the following details:

PROJECT DETAILS:
- Title: ${request.projectTitle}
- Description: ${request.projectDescription}
- Deadline: ${request.deadline}

PARTIES:
- Client Name: ${request.clientName}
- Client Email: ${request.clientEmail || 'Not provided'}
- Client Wallet: ${request.clientWallet}
- Freelancer Name: ${request.freelancerName}
- Freelancer Email: ${request.freelancerEmail || 'Not provided'}
- Freelancer Wallet: ${request.freelancerWallet}

PAYMENT TERMS:
- Total Amount: ${request.paymentAmount} ${request.tokenType}
- Blockchain Network: ${request.chain}
- Payment Method: Cryptocurrency (${request.tokenType} on ${request.chain} network)

${request.milestones.length > 0 ? `MILESTONES:
${request.milestones.map((milestone, index) => 
  `${index + 1}. ${milestone.title}
     Description: ${milestone.description}
     Amount: ${milestone.amount} ${request.tokenType}
     Deadline: ${milestone.deadline}`
).join('\n\n')}` : ''}

${request.refundPolicy ? `REFUND POLICY:
${request.refundPolicy}` : ''}

Please generate a comprehensive, legally sound freelance service agreement that includes:
1. Clear project scope and deliverables
2. Payment terms and schedule
3. Intellectual property rights
4. Termination clauses
5. Dispute resolution procedures
6. Cryptocurrency payment specifics
7. Professional formatting with proper sections

The contract should be professional, legally comprehensive, and suitable for freelance work involving cryptocurrency payments. Include standard legal protections for both parties.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const contractText = response.text();

      if (!contractText || contractText.trim().length === 0) {
        throw new Error('AI generated empty contract text');
      }

      return contractText.trim();
    } catch (error) {
      console.error('[LegalContractService] Error generating contract with AI:', error);
      // Fallback to template-based generation
      return this.generateContractText(request);
    }
  }

  /**
   * Generate contract text (fallback template implementation)
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

  /**
   * Get token address for a given token type and chain
   */
  private getTokenAddress(tokenType: string, chain: string): string {
    // Token addresses for different chains
    const tokenAddresses: Record<string, Record<string, string>> = {
      base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        ETH: '0x0000000000000000000000000000000000000000'
      },
      celo: {
        cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
        CELO: '0x0000000000000000000000000000000000000000'
      },
      ethereum: {
        USDC: '0xA0b86a33E6441b8C4505E2c4B8b5b8e8E8E8E8E8',
        ETH: '0x0000000000000000000000000000000000000000'
      }
    };

    return tokenAddresses[chain]?.[tokenType] || tokenAddresses.base.USDC;
  }
}

export const legalContractService = new LegalContractService();