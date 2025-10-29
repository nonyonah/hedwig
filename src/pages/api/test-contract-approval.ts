import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TestResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { action, contractId } = req.body;

  try {
    switch (action) {
      case 'check_contract':
        if (!contractId) {
          return res.status(400).json({
            success: false,
            error: 'Contract ID is required'
          });
        }

        // Check if contract exists in project_contracts
        const { data: contract, error: contractError } = await supabase
          .from('project_contracts')
          .select(`
            *,
            contract_milestones (*)
          `)
          .eq('id', contractId)
          .single();

        if (contractError) {
          return res.status(404).json({
            success: false,
            error: `Contract not found: ${contractError.message}`
          });
        }

        // Check freelancer user data
        let freelancerUser: any = null;
        if (contract.freelancer_id) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, email, username, telegram_chat_id')
            .eq('id', contract.freelancer_id)
            .single();
          freelancerUser = userData;
        }

        // Check if invoices exist
        const { data: invoices } = await supabase
          .from('invoices')
          .select('*')
          .eq('project_contract_id', contractId);

        return res.status(200).json({
          success: true,
          message: 'Contract data retrieved successfully',
          data: {
            contract,
            freelancer: freelancerUser,
            invoices: invoices || [],
            milestones: contract.contract_milestones || []
          }
        });

      case 'test_approval':
        if (!contractId) {
          return res.status(400).json({
            success: false,
            error: 'Contract ID is required'
          });
        }

        // Test the approval process
        const approvalResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/contracts/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contractId: contractId
          })
        });

        const approvalResult = await approvalResponse.json();

        return res.status(200).json({
          success: approvalResponse.ok,
          message: approvalResponse.ok ? 'Contract approval test completed' : 'Contract approval test failed',
          data: approvalResult
        });

      case 'list_contracts':
        // List all contracts for testing
        const { data: contracts } = await supabase
          .from('project_contracts')
          .select('id, project_title, status, freelancer_id, client_email, created_at')
          .order('created_at', { ascending: false })
          .limit(10);

        return res.status(200).json({
          success: true,
          message: 'Contracts retrieved successfully',
          data: contracts || []
        });

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Available actions: check_contract, test_approval, list_contracts'
        });
    }
  } catch (error) {
    console.error('Error in test contract approval:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}