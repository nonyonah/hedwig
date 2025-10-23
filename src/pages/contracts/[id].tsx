import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useAppKitWallet } from '../../hooks/useAppKitWallet';
import { AppKitButton } from '../../components/AppKitButton';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';

interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  deadline: string;
  status: 'pending' | 'in_progress' | 'completed' | 'approved';
}

interface LegalContract {
  id: string;
  client_name: string;
  freelancer_name: string;
  client_email: string;
  freelancer_email: string;
  token_type: string;
}

interface ContractData {
  id: string;
  contract_id: string;
  project_title: string;
  project_description: string;
  total_amount: number;
  token_address: string;
  chain: string;
  deadline: string;
  status: string;
  created_at: string;
  approved_at?: string;
  smart_contract_address?: string;
  milestones: Milestone[];
  legal_contract: LegalContract;
}

interface ContractPageProps {
  contract: ContractData | null;
  error?: string;
}

export default function ContractPage({ contract, error }: ContractPageProps) {
  const router = useRouter();
  const { isConnected, address, connectWallet, switchToChain, chainId } = useAppKitWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMilestone, setCurrentMilestone] = useState<Milestone | null>(null);

  const { writeContract, data: hash, isPending, error: contractError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (contract?.milestones) {
      const nextMilestone = contract.milestones.find(m => m.status === 'pending' || m.status === 'in_progress');
      setCurrentMilestone(nextMilestone || null);
    }
  }, [contract]);

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Contract Not Found</h1>
          <p className="text-gray-600 mb-6">
            {error || 'The contract you are looking for does not exist or has been removed.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTokenSymbol = (tokenAddress: string) => {
    if (!tokenAddress) return 'USDC';
    
    const address = tokenAddress.toLowerCase();
    
    // Base network tokens
    if (contract.chain === 'base') {
      if (address === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') return 'USDC';
      if (address === '0x0000000000000000000000000000000000000000') return 'ETH';
    }
    
    // Celo network tokens
    if (contract.chain === 'celo') {
      if (address === '0x765de816845861e75a25fca122bb6898b8b1282a') return 'cUSD';
      if (address === '0x0000000000000000000000000000000000000000') return 'CELO';
    }
    
    // Ethereum network tokens
    if (contract.chain === 'ethereum') {
      if (address === '0xa0b86a33e6441b8c4505e2c4b8b5b8e8e8e8e8e8') return 'USDC';
      if (address === '0x0000000000000000000000000000000000000000') return 'ETH';
    }
    
    // Fallback to legal contract token type or default
    return contract.legal_contract?.token_type || 'USDC';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleMilestoneAction = async (milestone: Milestone, action: 'start' | 'submit' | 'approve') => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    // Ensure we're on the correct chain
    const targetChainId = contract.chain === 'base' ? 8453 : 1;
    if (chainId !== targetChainId) {
      await switchToChain(targetChainId);
      return;
    }

    setIsProcessing(true);

    try {
      if (action === 'start') {
        // Update milestone status to in_progress
        const response = await fetch('/api/contracts/milestone/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractId: contract.id,
            milestoneId: milestone.id,
          }),
        });

        if (response.ok) {
          router.reload();
        }
      } else if (action === 'submit') {
        // Submit milestone for approval
        const response = await fetch('/api/contracts/milestone/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractId: contract.id,
            milestoneId: milestone.id,
          }),
        });

        if (response.ok) {
          router.reload();
        }
      } else if (action === 'approve' && contract.smart_contract_address) {
        // Approve milestone and release payment via smart contract
        writeContract({
          address: contract.smart_contract_address as `0x${string}`,
          abi: [
            {
              name: 'approveMilestone',
              type: 'function',
              inputs: [{ name: 'milestoneIndex', type: 'uint256' }],
              outputs: [],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'approveMilestone',
          args: [BigInt(contract.milestones.indexOf(milestone))],
        });
      }
    } catch (error) {
      console.error('Milestone action error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const isFreelancer = address?.toLowerCase() === contract.legal_contract?.freelancer_email?.toLowerCase();
  const isClient = address?.toLowerCase() === contract.legal_contract?.client_email?.toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{contract.project_title}</h1>
              <p className="text-gray-600">Contract ID: {contract.contract_id}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(contract.status)}`}>
                {contract.status.replace('_', ' ').toUpperCase()}
              </span>
              {!isConnected && <AppKitButton />}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Client</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p className="font-medium text-gray-900">{contract.legal_contract?.client_name}</p>
                <p>{contract.legal_contract?.client_email}</p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Freelancer</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p className="font-medium text-gray-900">{contract.legal_contract?.freelancer_name}</p>
                <p>{contract.legal_contract?.freelancer_email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Project Details */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Project Details</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Description</label>
              <p className="text-gray-600 mt-1">{contract.project_description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Total Amount</label>
                <p className="text-lg font-semibold text-gray-900">
                  {contract.total_amount.toLocaleString()} {getTokenSymbol(contract.token_address)}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Deadline</label>
                <p className="text-gray-600">{formatDate(contract.deadline)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Chain</label>
                <p className="text-gray-600 capitalize">{contract.chain}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Milestones</h3>
          <div className="space-y-4">
            {contract.milestones.map((milestone, index) => (
              <div key={milestone.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">
                      Milestone {index + 1}: {milestone.title}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getMilestoneStatusColor(milestone.status)}`}>
                    {milestone.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700">Amount</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {milestone.amount.toLocaleString()} {getTokenSymbol(contract.token_address)}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">Deadline</label>
                    <p className="text-sm text-gray-600">{formatDate(milestone.deadline)}</p>
                  </div>
                  <div className="flex items-end">
                    {isFreelancer && milestone.status === 'pending' && (
                      <button
                        onClick={() => handleMilestoneAction(milestone, 'start')}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Start Work
                      </button>
                    )}
                    {isFreelancer && milestone.status === 'in_progress' && (
                      <button
                        onClick={() => handleMilestoneAction(milestone, 'submit')}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        Submit for Review
                      </button>
                    )}
                    {isClient && milestone.status === 'completed' && (
                      <button
                        onClick={() => handleMilestoneAction(milestone, 'approve')}
                        disabled={isProcessing || isPending || isConfirming}
                        className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
                      >
                        {isPending || isConfirming ? 'Processing...' : 'Approve & Pay'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Smart Contract Info */}
        {contract.smart_contract_address && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Smart Contract</h3>
            <div className="space-y-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Contract Address</label>
                <p className="text-sm text-gray-600 font-mono break-all">{contract.smart_contract_address}</p>
              </div>
              <div>
                <a
                  href={`https://${contract.chain === 'base' ? 'basescan.org' : 'etherscan.io'}/address/${contract.smart_contract_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                >
                  View on {contract.chain === 'base' ? 'BaseScan' : 'Etherscan'} ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Status */}
        {isConfirmed && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-green-400 text-xl">✅</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Transaction Confirmed</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Milestone payment has been processed successfully!</p>
                  {hash && (
                    <a
                      href={`https://${contract.chain === 'base' ? 'basescan.org' : 'etherscan.io'}/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-800 underline"
                    >
                      View transaction ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {contractError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-400 text-xl">❌</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Transaction Failed</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{contractError.message}</p>
                </div>
              </div>
            </div>
          </div>
        )}
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

    // Fetch contract with milestones
    const { data: contract, error: contractError } = await supabaseServer
      .from('project_contracts')
      .select(`
        *,
        milestones:contract_milestones(*)
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

    // Fetch legal contract separately using the legal_contract_hash
    let legalContract = null;
    if (contract.legal_contract_hash) {
      const { data: legalData } = await supabaseServer
        .from('legal_contracts')
        .select('*')
        .eq('id', contract.legal_contract_hash)
        .single();
      
      legalContract = legalData;
    }

    return {
      props: {
        contract: {
          ...contract,
          legal_contract: legalContract
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