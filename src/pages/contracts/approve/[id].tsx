import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import { GetServerSideProps } from 'next';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ContractData {
  id: string;
  project_title: string;
  project_description: string;
  client_id: string;
  freelancer_id: string;
  total_amount: number;
  token_address: string;
  chain: string;
  deadline: string;
  status: string;
  legal_contract_id: string;
  created_at: string;
  milestones: Array<{
    id: string;
    title: string;
    description: string;
    amount: number;
    deadline: string;
    status: string;
  }>;
  legal_contract?: {
    contract_text: string;
    client_name: string;
    freelancer_name: string;
    freelancer_email: string;
    token_type: string;
  };
}

interface ContractApprovalPageProps {
  contract: ContractData | null;
  error?: string;
}

export default function ContractApprovalPage({ contract, error }: ContractApprovalPageProps) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Contract Not Found</h1>
            <p className="text-gray-600 mb-4">
              {error || 'The contract you are looking for does not exist or has been removed.'}
            </p>
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleApproval = async () => {
    setIsApproving(true);
    setApprovalError(null);

    try {
      const response = await fetch(`/api/contracts/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId: contract.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve contract');
      }

      setIsApproved(true);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'Failed to approve contract');
    } finally {
      setIsApproving(false);
    }
  };

  if (isApproved) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="text-green-500 text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Contract Approved!</h1>
            <p className="text-gray-600 mb-4">
              Your contract has been approved and the smart contract deployment process has begun. 
              You will receive an email confirmation shortly.
            </p>
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTokenSymbol = (tokenAddress: string) => {
    // Simple mapping - in production, you'd want a more robust solution
    if (tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') return 'USDC';
    if (tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') return 'ETH';
    return contract.legal_contract?.token_type || 'USDC';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
            <h1 className="text-3xl font-bold">Contract Approval Required</h1>
            <p className="mt-2 opacity-90">Please review the contract details below</p>
          </div>

          {/* Contract Details */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Project Information</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Project Title</label>
                    <p className="text-gray-900">{contract.project_title}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <p className="text-gray-900">{contract.project_description}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Freelancer</label>
                    <p className="text-gray-900">{contract.legal_contract?.freelancer_name}</p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Information</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Total Amount</label>
                    <p className="text-2xl font-bold text-blue-600">
                      {contract.total_amount} {getTokenSymbol(contract.token_address)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Network</label>
                    <p className="text-gray-900 capitalize">{contract.chain}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Project Deadline</label>
                    <p className="text-gray-900">{formatDate(contract.deadline)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Milestones */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Project Milestones</h2>
              <div className="space-y-4">
                {contract.milestones.map((milestone, index) => (
                  <div key={milestone.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-gray-900">
                        Milestone {index + 1}: {milestone.title}
                      </h3>
                      <span className="text-lg font-bold text-blue-600">
                        {milestone.amount} {getTokenSymbol(contract.token_address)}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-2">{milestone.description}</p>
                    <p className="text-sm text-gray-500">
                      Due: {formatDate(milestone.deadline)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Contract Text */}
            {contract.legal_contract?.contract_text && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Legal Contract</h2>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                    {contract.legal_contract.contract_text}
                  </pre>
                </div>
              </div>
            )}

            {/* Approval Section */}
            <div className="border-t border-gray-200 pt-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-400 text-xl">⚠️</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Important Notice
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        By approving this contract, you authorize the transfer of{' '}
                        <strong>{contract.total_amount} {getTokenSymbol(contract.token_address)}</strong>{' '}
                        to a secure smart contract escrow. Funds will be released to the freelancer 
                        upon completion of each milestone as specified above.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {approvalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-red-400 text-xl">❌</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Approval Failed
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{approvalError}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => router.push('/')}
                  className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproval}
                  disabled={isApproving}
                  className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isApproving ? 'Approving...' : 'Approve Contract'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.params!;

  try {
    const supabaseServer = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch contract with milestones and legal contract
    const { data: contract, error: contractError } = await supabaseServer
      .from('project_contracts')
      .select(`
        *,
        milestones:contract_milestones(*),
        legal_contract:legal_contracts(*)
      `)
      .eq('id', id)
      .single();

    if (contractError || !contract) {
      return {
        props: {
          contract: null,
          error: 'Contract not found'
        }
      };
    }

    return {
      props: {
        contract: {
          ...contract,
          legal_contract: contract.legal_contract?.[0] || null
        }
      }
    };
  } catch (error) {
    console.error('Error fetching contract:', error);
    return {
      props: {
        contract: null,
        error: 'Failed to load contract'
      }
    };
  }
};