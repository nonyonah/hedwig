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
  blockchain_project_id?: number;
  transaction_hash?: string;
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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isSigningContract, setIsSigningContract] = useState(false);

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
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800';
      case 'deployment_pending':
        return 'bg-orange-100 text-orange-800';
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

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const response = await fetch(`/api/contracts/${contract.id}/pdf`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `contract_${contract.contract_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleSignContract = async () => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    // Ensure we're on the correct chain
    const targetChainId = contract.chain === 'base' ? 8453 : contract.chain === 'celo' ? 42220 : 1;
    if (chainId !== targetChainId) {
      await switchToChain(targetChainId);
      return;
    }

    setIsSigningContract(true);

    try {
      console.log('[Contract Page] Signing contract with ID:', contract.id);
      
      // Call the contract approval API to deploy the smart contract
      const response = await fetch('/api/contracts/approve', {
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
        throw new Error(result.error || 'Failed to sign contract');
      }

      // Show success message and reload to show updated status
      alert('✅ Contract signed successfully! Smart contract has been deployed.');
      router.reload();

    } catch (error) {
      console.error('Contract signing error:', error);
      alert(`❌ Failed to sign contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSigningContract(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => router.back()}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Contract Details</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isGeneratingPDF ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    📄 Download PDF
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/contracts/debug/${contract.id}`);
                    const result = await response.json();
                    console.log('Debug result:', result);
                    alert(`Contract Status: ${result.contract?.status || 'Unknown'}`);
                  } catch (error) {
                    console.error('Debug error:', error);
                    alert('Debug failed - check console');
                  }
                }}
                className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
              >
                🔍 Debug
              </button>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">📧</span>
                <span className="text-gray-500">⋯</span>
              </div>
            </div>
          </div>

          {/* General Information Section */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">General Information</h2>
            
            {/* Client Profile */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-gray-500 text-lg">👤</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{contract.legal_contract?.client_name}</h3>
                <p className="text-gray-600 text-sm">{contract.legal_contract?.client_email}</p>
              </div>
            </div>

            {/* Contract Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-500">Contract Name</label>
                <p className="text-gray-900 font-medium">{contract.project_title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Team</label>
                <p className="text-gray-900 font-medium">Hedwig Team</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Job Title</label>
                <p className="text-gray-900 font-medium">Freelancer</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Start Date</label>
                <p className="text-gray-900 font-medium">{formatDate(contract.created_at)}</p>
              </div>
            </div>

            {/* Area of Work */}
            <div className="mt-6">
              <label className="text-sm font-medium text-gray-500">Area of Work</label>
              <div className="mt-2 space-y-2">
                <p className="text-gray-900">1. Research: {contract.project_description}</p>
                <p className="text-gray-900">2. Concept development: Delivering milestones according to agreed timeline and specifications.</p>
                <button className="text-blue-600 text-sm font-medium">See More</button>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Information Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Payment Information</h2>
          
          {/* Payment Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="text-sm font-medium text-gray-500">Type</label>
              <p className="text-gray-900 font-medium">Milestone</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">No of Milestone</label>
              <p className="text-gray-900 font-medium">{contract.milestones?.length || 0}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Payment Status</label>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                <span className="text-blue-600 font-medium">Processing</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Last Payment</label>
              <p className="text-gray-900 font-medium">{formatDate(contract.deadline)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Total Amount</label>
              <p className="text-xl font-bold text-gray-900">{getTokenSymbol(contract.token_address)} ${contract.total_amount.toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Each Milestone</label>
              <p className="text-gray-900 font-medium">
                {getTokenSymbol(contract.token_address)} ${contract.milestones?.length > 0 ? 
                  Math.round(contract.total_amount / contract.milestones.length).toLocaleString() : 
                  contract.total_amount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-6">
          {contract.status === 'created' || contract.status === 'pending_approval' ? (
            <>
              {!isConnected ? (
                <AppKitButton />
              ) : (
                <button
                  onClick={handleSignContract}
                  disabled={isSigningContract}
                  className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {isSigningContract ? 'Signing Contract...' : 'Make Payment'}
                </button>
              )}
              <button className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 px-6 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                Terminate Contract
              </button>
            </>
          ) : contract.status === 'deployment_pending' ? (
            <div className="flex-1 bg-orange-50 border border-orange-200 text-orange-800 py-3 px-6 rounded-lg text-center font-medium">
              ⏳ Contract Approved - Smart Contract Deployment Pending
            </div>
          ) : contract.status === 'approved' || contract.status === 'active' ? (
            <div className="flex-1 bg-green-50 border border-green-200 text-green-800 py-3 px-6 rounded-lg text-center font-medium">
              ✅ Contract Active - Smart Contract Deployed
            </div>
          ) : (
            <div className="flex-1 bg-gray-50 border border-gray-200 text-gray-800 py-3 px-6 rounded-lg text-center font-medium">
              📄 Contract Status: {contract.status.replace('_', ' ').toUpperCase()}
            </div>
          )}
        </div>



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