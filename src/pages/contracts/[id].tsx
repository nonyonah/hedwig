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
  const [contractCreationStep, setContractCreationStep] = useState<'idle' | 'creating' | 'funding' | 'completed'>('idle');
  const [createdContractId, setCreatedContractId] = useState<number | null>(null);
  const [milestoneTransactionType, setMilestoneTransactionType] = useState<'complete' | 'approve' | null>(null);
  const [processingMilestone, setProcessingMilestone] = useState<Milestone | null>(null);

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

  // Reset signing state when transaction is sent
  useEffect(() => {
    if (hash && !isConfirming) {
      setIsSigningContract(false);
    }
  }, [hash, isConfirming]);

  // Handle transaction confirmation and update contract status
  useEffect(() => {
    if (isConfirmed && hash && contract) {
      if (contractCreationStep === 'creating') {
        // Contract creation confirmed, now extract contract ID and proceed to funding
        handleContractCreated(hash);
      } else if (contractCreationStep === 'funding') {
        // Funding confirmed, update contract status in database
        updateContractStatus(hash);
      } else if (milestoneTransactionType === 'complete' && processingMilestone) {
        // Milestone completion confirmed, update database
        handleMilestoneCompleted(processingMilestone);
      } else if (milestoneTransactionType === 'approve' && processingMilestone) {
        // Milestone approval confirmed, update database
        handleMilestoneApproved(processingMilestone);
      }
    }
  }, [isConfirmed, hash, contract, contractCreationStep, milestoneTransactionType, processingMilestone]);

  const handleContractCreated = async (transactionHash: string) => {
    try {
      // Extract contract ID from transaction logs
      // For now, we'll use a placeholder - in production, you'd parse the transaction receipt
      const contractId = Date.now(); // This should be extracted from transaction logs
      setCreatedContractId(contractId);
      setContractCreationStep('funding');
      
      // Now proceed to fund the contract
      await fundContract(contractId);
    } catch (error) {
      console.error('Error handling contract creation:', error);
      setContractCreationStep('idle');
      setIsSigningContract(false);
    }
  };

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
    if (contract!.chain === 'base') {
      return '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC on Base Sepolia testnet
    } else if (contract!.chain === 'celo') {
      return '0x765DE816845861e75A25fCA122bb6898B8B1282a'; // cUSD on Celo
    }
    return '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Default to USDC Base Sepolia
  };

  const fundContract = async (contractId: number) => {
    try {
      // Get contract details for funding
      const hedwigContractAddress = getHedwigContractAddress();
      const amountInWei = BigInt(contract!.total_amount * Math.pow(10, 6));

      const hedwigProjectABI = [
        {
          "inputs": [
            {"name": "_contractId", "type": "uint256"}
          ],
          "name": "fundContract",
          "outputs": [],
          "stateMutability": "payable",
          "type": "function"
        }
      ];

      // Call fundContract function
      writeContract({
        address: hedwigContractAddress as `0x${string}`,
        abi: hedwigProjectABI,
        functionName: 'fundContract',
        args: [BigInt(contractId)],
        value: contract!.token_address === '0x0000000000000000000000000000000000000000' ? amountInWei : BigInt(0)
      });

    } catch (error) {
      console.error('Error funding contract:', error);
      setContractCreationStep('idle');
      setIsSigningContract(false);
    }
  };

  const updateContractStatus = async (transactionHash: string) => {
    try {
      const response = await fetch('/api/contracts/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId: contract!.id,
          transactionHash: transactionHash,
          smartContractAddress: getHedwigContractAddress(),
          blockchainProjectId: createdContractId
        }),
      });

      if (response.ok) {
        setContractCreationStep('completed');
        setTimeout(() => {
          router.reload();
        }, 2000); // Wait 2 seconds to show success message, then reload
      }
    } catch (error) {
      console.error('Failed to update contract status:', error);
      setContractCreationStep('idle');
      setIsSigningContract(false);
    }
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
        setMilestoneTransactionType(null);
        setProcessingMilestone(null);
        setIsProcessing(false);
        router.reload();
      }
    } catch (error) {
      console.error('Failed to update milestone status:', error);
      setMilestoneTransactionType(null);
      setProcessingMilestone(null);
      setIsProcessing(false);
    }
  };

  const handleMilestoneApproved = async (milestone: Milestone) => {
    try {
      // For milestone approval, we might need a different API endpoint
      // For now, we'll just reload to show the updated status
      setMilestoneTransactionType(null);
      setProcessingMilestone(null);
      setIsProcessing(false);
      router.reload();
    } catch (error) {
      console.error('Failed to handle milestone approval:', error);
      setMilestoneTransactionType(null);
      setProcessingMilestone(null);
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

  const handleMilestoneAction = async (milestone: Milestone, action: 'start' | 'submit' | 'approve') => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    // Ensure we're on the correct chain (Base Sepolia for testing)
    const targetChainId = contract.chain === 'base' ? 84532 : contract.chain === 'celo' ? 42220 : 1; // 84532 is Base Sepolia
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
        // Submit milestone for approval - first call smart contract, then update database
        if (contract.smart_contract_address && contract.blockchain_project_id) {
          // Set transaction type and milestone for confirmation handling
          setMilestoneTransactionType('complete');
          setProcessingMilestone(milestone);
          
          // Call smart contract to mark as completed
          writeContract({
            address: contract.smart_contract_address as `0x${string}`,
            abi: [
              {
                name: 'completeContract',
                type: 'function',
                inputs: [{ name: 'contractId', type: 'uint256' }],
                outputs: [],
                stateMutability: 'nonpayable',
              },
            ],
            functionName: 'completeContract',
            args: [BigInt(contract.blockchain_project_id)],
          });
        } else {
          // Fallback to database-only update if smart contract not available
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
        }
      } else if (action === 'approve' && contract.smart_contract_address && contract.blockchain_project_id) {
        // Set transaction type and milestone for confirmation handling
        setMilestoneTransactionType('approve');
        setProcessingMilestone(milestone);
        
        // Approve contract and release payment via smart contract
        writeContract({
          address: contract.smart_contract_address as `0x${string}`,
          abi: [
            {
              name: 'approveContract',
              type: 'function',
              inputs: [{ name: 'contractId', type: 'uint256' }],
              outputs: [],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'approveContract',
          args: [BigInt(contract.blockchain_project_id)],
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

    // Ensure we're on the correct chain (Base Sepolia for testing)
    const targetChainId = contract.chain === 'base' ? 84532 : contract.chain === 'celo' ? 42220 : 1; // 84532 is Base Sepolia
    if (chainId !== targetChainId) {
      await switchToChain(targetChainId);
      return;
    }

    setIsSigningContract(true);

    try {
      console.log('[Contract Page] Starting contract creation process with ID:', contract.id);
      
      // Set the creation step to 'creating'
      setContractCreationStep('creating');
      
      const hedwigContractAddress = getHedwigContractAddress();
      
      if (!hedwigContractAddress) {
        throw new Error('Hedwig contract address not found for this chain');
      }

      // Convert amount to wei (USDC has 6 decimals)
      const amountInWei = BigInt(contract.total_amount * Math.pow(10, 6));
      
      // Get freelancer wallet from legal contract - must be a real address, no placeholders
      const freelancerWallet = contract.legal_contract?.freelancer_wallet;
      if (!freelancerWallet || freelancerWallet.length !== 42 || !/^0x[a-fA-F0-9]{40}$/.test(freelancerWallet)) {
        throw new Error('Freelancer wallet address is required but not found in the contract. Please ensure the freelancer has provided their wallet address.');
      }

      // Hedwig Project Contract ABI for createContract function
      const hedwigProjectABI = [
        {
          "inputs": [
            {"name": "_client", "type": "address"},
            {"name": "_freelancer", "type": "address"},
            {"name": "_projectTitle", "type": "string"},
            {"name": "_amount", "type": "uint256"},
            {"name": "_token", "type": "address"},
            {"name": "_deadline", "type": "uint256"}
          ],
          "name": "createContract",
          "outputs": [{"name": "", "type": "uint256"}],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ];

      // Step 1: Call createContract function on the Hedwig contract
      writeContract({
        address: hedwigContractAddress as `0x${string}`,
        abi: hedwigProjectABI,
        functionName: 'createContract',
        args: [
          address as `0x${string}`, // client (current user)
          freelancerWallet as `0x${string}`, // freelancer
          contract.project_title, // project title
          amountInWei, // amount in wei
          getTokenAddress() as `0x${string}`, // token address
          BigInt(Math.floor(new Date(contract.deadline).getTime() / 1000)) // deadline as unix timestamp
        ]
      });

      console.log('[Contract Page] Contract creation transaction initiated');
      
      // The useWaitForTransactionReceipt hook will handle the confirmation
      // and trigger the funding step automatically

    } catch (error) {
      console.error('Contract signing error:', error);
      alert(`❌ Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                  disabled={isSigningContract || isPending || isConfirming || contractCreationStep !== 'idle'}
                  className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {contractCreationStep === 'creating' ? 'Creating Contract...' :
                   contractCreationStep === 'funding' ? 'Funding Contract...' :
                   contractCreationStep === 'completed' ? 'Contract Created!' :
                   isSigningContract ? 'Connecting Wallet...' : 
                   isPending ? 'Confirm in Wallet...' :
                   isConfirming ? 'Confirming Transaction...' :
                   'Create & Fund Contract'}
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
                <h3 className="text-sm font-medium text-green-800">Contract Created Successfully!</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Your project has been created in the Hedwig smart contract escrow. Funds are now securely held until milestones are completed.</p>
                  {hash && (
                    <a
                      href={`https://${contract.chain === 'base' ? 'sepolia.basescan.org' : contract.chain === 'celo' ? 'celoscan.io' : 'etherscan.io'}/tx/${hash}`}
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