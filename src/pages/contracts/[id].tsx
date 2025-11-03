import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useAppKitWallet } from '../../hooks/useAppKitWallet';
import { AppKitButton } from '../../components/AppKitButton';
import { MilestoneProgress } from '../../components/ui/ProgressBar';


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
  freelancer_wallet?: string;
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
  freelancer_id?: string;
  freelancer_wallet?: string;
  client_id?: string;
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
  const [contractStep, setContractStep] = useState<'idle' | 'signing' | 'approved'>('idle');



  useEffect(() => {
    if (contract?.milestones) {
      const nextMilestone = contract.milestones.find(m => m.status === 'pending' || m.status === 'in_progress');
      setCurrentMilestone(nextMilestone || null);
    }
  }, [contract]);



  // No longer needed - we handle approval directly in handleSignContract

  // No longer needed - we handle errors directly in handleSignContract

  // Reset signing state when approval is complete
  useEffect(() => {
    if (contractStep === 'approved') {
      setIsSigningContract(false);
    }
  }, [contractStep]);



  // Helper functions
  const getHedwigContractAddress = () => {
    if (contract!.chain === 'base') {
      return process.env.NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS_BASE_SEPOLIA;
    } else if (contract!.chain === 'celo') {
      return process.env.NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS_CELO_MAINNET;
    }
    throw new Error(`Unsupported chain: ${contract!.chain}`);
  };

  const getTokenAddress = () => {
    if (contract?.chain === 'base') {
      return '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC on Base Sepolia testnet
    } else if (contract?.chain === 'celo') {
      return '0x765DE816845861e75A25fCA122bb6898B8B1282a'; // cUSD on Celo
    }
    return '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Default to USDC Base Sepolia
  };



  const handleMilestoneCompleted = async (milestone: Milestone) => {
    try {
      const response = await fetch('/api/contracts/milestone/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: contract!.id,
          milestoneId: milestone.id,
        }),
      });

      if (response.ok) {
        router.reload();
      }
    } catch (error) {
      console.error('Failed to update milestone status:', error);
    } finally {
      setIsProcessing(false);
    }
  };

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

    if (!address) {
      console.error('[Contract Page] No wallet address found');
      alert('❌ Wallet address not found. Please reconnect your wallet.');
      return;
    }

    setIsSigningContract(true);
    setContractStep('signing');

    try {
      console.log('[Contract Page] Signing contract approval with ID:', contract.id);
      console.log('[Contract Page] Connected wallet address:', address);
      console.log('[Contract Page] Full contract object:', contract);

      // Create a message to sign for contract approval
      const message = `I approve the contract "${contract.project_title}" for $${contract.total_amount} ${getTokenSymbol(contract.token_address)} with deadline ${formatDate(contract.deadline)}. Contract ID: ${contract.id}`;

      // Sign the message using personal_sign
      const signature = await (window as any).ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      console.log('[Contract Page] Contract approval signed:', signature);

      // Call the approval API with the signature
      const response = await fetch('/api/contracts/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId: contract.id,
          signature: signature,
          message: message,
          clientAddress: address
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setContractStep('approved');
        console.log('[Contract Page] Contract approved and invoice generated:', result.invoiceId);

        // Show success message
        alert(`✅ Contract approved successfully! An invoice has been generated and the freelancer has been notified.`);

        // Reload page to show updated status
        setTimeout(() => {
          router.reload();
        }, 2000);
      } else {
        const errorData = await response.json();
        console.error('[Contract Page] Approval API error:', errorData);
        throw new Error(errorData.error || 'Failed to approve contract');
      }

    } catch (error) {
      console.error('Contract approval error:', error);
      alert(`❌ Failed to approve contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSigningContract(false);
      setContractStep('idle');
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
                <label className="text-sm font-medium text-gray-500">Freelancer Name</label>
                <p className="text-gray-900 font-medium">{contract.legal_contract?.freelancer_name || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Start Date</label>
                <p className="text-gray-900 font-medium">{formatDate(contract.created_at)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Deadline</label>
                <div className="flex items-center gap-2">
                  <p className="text-gray-900 font-medium">{formatDate(contract.deadline)}</p>
                  {(() => {
                    const deadlineDate = new Date(contract.deadline);
                    const today = new Date();
                    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    
                    if (daysUntilDeadline < 0) {
                      return <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Overdue</span>;
                    } else if (daysUntilDeadline <= 3) {
                      return <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Due Soon</span>;
                    } else {
                      return <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">On Track</span>;
                    }
                  })()}
                </div>
              </div>
            </div>

            {/* Project Description */}
            <div className="mt-6">
              <label className="text-sm font-medium text-gray-500">Project Description</label>
              <div className="mt-2">
                <p className="text-gray-900">{contract.project_description || 'No description provided'}</p>
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
                {contract.status === 'approved' || contract.status === 'active' ? (
                  <>
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-green-600 font-medium">Active</span>
                  </>
                ) : contract.status === 'completed' ? (
                  <>
                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span className="text-blue-600 font-medium">Completed</span>
                  </>
                ) : (
                  <>
                    <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full"></span>
                    <span className="text-yellow-600 font-medium">Pending</span>
                  </>
                )}
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

          {/* Wallet Addresses Section */}
          <div className="border-t pt-6">
            <h3 className="text-md font-semibold text-gray-900 mb-4">Wallet Addresses</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-500">Client Wallet</label>
                <p className="text-gray-900 font-mono text-sm break-all">
                  {address || 'Not connected'}
                </p>
                {address && (
                  <p className="text-xs text-gray-500 mt-1">Currently connected wallet</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Freelancer Info</label>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500">Freelancer ID:</p>
                    <p className="text-gray-900 font-mono text-sm">{contract.freelancer_id || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Wallet Address:</p>
                    <p className="text-gray-900 font-mono text-sm break-all">
                      {contract.freelancer_wallet || 'Not provided'}
                    </p>
                  </div>
                  {!contract.freelancer_wallet && (
                    <p className="text-xs text-red-500 mt-1">⚠️ Freelancer needs to provide wallet address</p>
                  )}
                  {contract.freelancer_wallet && (
                    <p className="text-xs text-green-600 mt-1">✅ Wallet address provided</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Milestones Section */}
        {contract.milestones && contract.milestones.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <MilestoneProgress 
              milestones={contract.milestones}
              totalAmount={contract.total_amount}
              currency={getTokenSymbol(contract.token_address)}
              contractId={contract.id}
              isFreelancer={isFreelancer}
              isClient={isClient}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 mb-6">
          {contract.status === 'created' || contract.status === 'pending_approval' ? (
            <>
              {!isConnected ? (
                <AppKitButton />
              ) : !contract.freelancer_wallet ? (
                <div className="flex-1">
                  <button
                    disabled={true}
                    className="bg-gray-400 text-white rounded-lg cursor-not-allowed transition-colors font-medium w-[500px] h-[44px] flex items-center justify-center text-sm"
                  >
                    ⚠️ Freelancer Wallet Required
                  </button>
                  <p className="text-sm text-red-600 mt-2 text-center">
                    The freelancer must provide their wallet address before the contract can be created.
                  </p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSignContract}
                    disabled={isSigningContract || contractStep !== 'idle'}
                    className="bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium w-[400px] h-[44px] flex items-center justify-center text-sm"
                  >
                    {contractStep === 'signing' ? 'Signing Contract...' :
                      contractStep === 'approved' ? 'Contract Approved!' :
                        isSigningContract ? 'Please Sign in Wallet...' :
                          'Approve Contract'}
                  </button>

                  {/* Reset button - only show when signing is in progress */}
                  {(contractStep === 'signing') && (
                    <button
                      onClick={() => {
                        console.log('[Contract Page] Manual reset triggered');
                        setIsSigningContract(false);
                        setContractStep('idle');
                      }}
                      className="bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium w-[100px] h-[44px] flex items-center justify-center text-sm"
                      title="Reset signing state"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
              <button className="bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm w-[500px] h-[44px] flex items-center justify-center">
                Terminate Contract
              </button>
            </>
          ) : contract.status === 'deployment_pending' ? (
            <div className="flex-1 bg-orange-50 border border-orange-200 text-orange-800 py-3 px-6 rounded-lg text-center font-medium">
              ⏳ Contract Approved - Invoice Generation Pending
            </div>
          ) : contract.status === 'approved' || contract.status === 'active' ? (
            <div className="flex-1 bg-green-50 border border-green-200 text-green-800 py-3 px-6 rounded-lg text-center font-medium">
              ✅ Contract Approved - Ready for Work
            </div>
          ) : (
            <div className="flex-1 bg-gray-50 border border-gray-200 text-gray-800 py-3 px-6 rounded-lg text-center font-medium">
              📄 Contract Status: {contract.status.replace('_', ' ').toUpperCase()}
            </div>
          )}
        </div>



        {/* Contract Approval Status */}
        {contractStep === 'approved' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-green-400 text-xl">✅</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Contract Approved Successfully!
                </h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>
                    Your contract has been approved and an invoice has been automatically generated. 
                    The freelancer has been notified and can now begin work on the project.
                  </p>
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
    let legalContract: LegalContract | null = null;
    if (contract.legal_contract_hash) {
      const { data: legalData } = await supabaseServer
        .from('legal_contracts')
        .select('*')
        .eq('id', contract.legal_contract_hash)
        .single();

      legalContract = legalData as LegalContract | null;
    }

    // Fetch freelancer wallet from wallets table using freelancer_id
    let freelancerWallet: string | null = null;

    // First try to get from legal contract (legacy)
    if (legalContract?.freelancer_wallet) {
      freelancerWallet = legalContract.freelancer_wallet;
    }

    // If not found in legal contract and we have freelancer_id, fetch from wallets table
    if (!freelancerWallet && contract.freelancer_id) {
      const { data: wallets } = await supabaseServer
        .from('wallets')
        .select('address, chain')
        .eq('user_id', contract.freelancer_id)
        .order('created_at', { ascending: true });

      if (wallets && wallets.length > 0) {
        // Prefer EVM/Base wallet, fallback to any wallet
        const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
        freelancerWallet = evmWallet?.address || wallets[0]?.address || null;
      }
    }

    // If still no wallet and we have freelancer email, try to find user by email and get their wallet
    if (!freelancerWallet && legalContract?.freelancer_email) {
      const { data: user } = await supabaseServer
        .from('users')
        .select('id')
        .eq('email', legalContract.freelancer_email)
        .single();

      if (user) {
        const { data: wallets } = await supabaseServer
          .from('wallets')
          .select('address, chain')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (wallets && wallets.length > 0) {
          // Prefer EVM/Base wallet, fallback to any wallet
          const evmWallet = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm' || (w.chain || '').toLowerCase() === 'base');
          freelancerWallet = evmWallet?.address || wallets[0]?.address || null;
        }
      }
    }

    // Debug logging
    console.log('[Contract Page] Freelancer wallet resolution:', {
      contractId: contract.id,
      freelancerId: contract.freelancer_id,
      freelancerEmail: legalContract?.freelancer_email,
      legalContractWallet: legalContract?.freelancer_wallet,
      resolvedWallet: freelancerWallet
    });

    return {
      props: {
        contract: {
          ...contract,
          legal_contract: legalContract,
          freelancer_wallet: freelancerWallet
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