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
  const [contractStep, setContractStep] = useState<'idle' | 'creating' | 'approving' | 'funding' | 'completed'>('idle');
  const [createdContractId, setCreatedContractId] = useState<number | null>(null);
  const [transactionTimeout, setTransactionTimeout] = useState<NodeJS.Timeout | null>(null);

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

  // Handle transaction confirmation for three-step process
  useEffect(() => {
    if (isConfirmed && hash && contract) {
      if (contractStep === 'creating') {
        // Step 1 completed: Contract created, now approve USDC
        handleContractCreated(hash);
      } else if (contractStep === 'approving') {
        // Step 2 completed: USDC approved, now fund contract
        handleUSDCApproved();
      } else if (contractStep === 'funding') {
        // Step 3 completed: Contract funded, update database
        handleContractFunded(hash);
      }
    }
  }, [isConfirmed, hash, router, contract, contractStep]);

  // Handle transaction errors
  useEffect(() => {
    if (contractError) {
      console.error('[Contract Page] Transaction error:', contractError);
      alert(`❌ Transaction failed: ${contractError.message}`);

      // Clear timeout if exists
      if (transactionTimeout) {
        clearTimeout(transactionTimeout);
        setTransactionTimeout(null);
      }

      // Reset states
      setIsSigningContract(false);
      setContractStep('idle');
    }
  }, [contractError, transactionTimeout]);

  // Set timeout when transaction starts
  useEffect(() => {
    if (isPending && contractStep !== 'idle') {
      // Clear any existing timeout
      if (transactionTimeout) {
        clearTimeout(transactionTimeout);
      }

      // Set new timeout (2 minutes)
      const timeout = setTimeout(() => {
        console.warn('[Contract Page] Transaction timeout - resetting state');
        setIsSigningContract(false);
        setContractStep('idle');
        alert('⏰ Transaction is taking longer than expected. Please try again.');
      }, 120000); // 2 minutes

      setTransactionTimeout(timeout);
    }
  }, [isPending, contractStep, transactionTimeout]);

  // Clear timeout when transaction completes
  useEffect(() => {
    if ((isConfirmed || contractError) && transactionTimeout) {
      clearTimeout(transactionTimeout);
      setTransactionTimeout(null);
    }
  }, [isConfirmed, contractError, transactionTimeout]);

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (transactionTimeout) {
        clearTimeout(transactionTimeout);
      }
    };
  }, [transactionTimeout]);



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

  // Three-step contract creation handlers
  const handleContractCreated = async (transactionHash: string) => {
    try {
      console.log('[Contract Page] Contract created successfully:', transactionHash);

      // Extract contract ID from transaction logs (simplified - using timestamp for now)
      const contractId = Date.now();
      setCreatedContractId(contractId);

      // Move to USDC approval step
      setContractStep('approving');
      await approveUSDC();
    } catch (error) {
      console.error('Error handling contract creation:', error);
      setContractStep('idle');
      setIsSigningContract(false);
    }
  };

  const approveUSDC = async () => {
    try {
      console.log('[Contract Page] Approving USDC for Hedwig contract');

      const hedwigContractAddress = getHedwigContractAddress();
      const amountInWei = BigInt((contract?.total_amount || 0) * Math.pow(10, 6)); // USDC has 6 decimals
      const tokenAddress = getTokenAddress();

      // Approve USDC spending by Hedwig contract
      writeContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              { "name": "spender", "type": "address" },
              { "name": "amount", "type": "uint256" }
            ],
            "name": "approve",
            "outputs": [{ "name": "", "type": "bool" }],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [hedwigContractAddress as `0x${string}`, amountInWei]
      });

      console.log('[Contract Page] USDC approval transaction initiated');
    } catch (error) {
      console.error('Error approving USDC:', error);
      setContractStep('idle');
      setIsSigningContract(false);
    }
  };

  const handleUSDCApproved = async () => {
    try {
      console.log('[Contract Page] USDC approved, now funding contract');

      // Move to funding step
      setContractStep('funding');
      await fundContract();
    } catch (error) {
      console.error('Error handling USDC approval:', error);
      setContractStep('idle');
      setIsSigningContract(false);
    }
  };

  const fundContract = async () => {
    try {
      console.log('[Contract Page] Funding contract with ID:', createdContractId);

      const hedwigContractAddress = getHedwigContractAddress();

      if (!createdContractId) {
        throw new Error('Contract ID not found');
      }

      // Call fundContract to transfer the approved USDC
      writeContract({
        address: hedwigContractAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              { "name": "contractId", "type": "uint256" }
            ],
            "name": "fundContract",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'fundContract',
        args: [BigInt(createdContractId)]
      });

      console.log('[Contract Page] Funding transaction initiated');
    } catch (error) {
      console.error('Error funding contract:', error);
      setContractStep('idle');
      setIsSigningContract(false);
    }
  };

  const handleContractFunded = async (transactionHash: string) => {
    try {
      console.log('[Contract Page] Contract funded successfully:', transactionHash);

      if (!contract) {
        console.error('Contract is null');
        return;
      }

      // Update contract status in database
      const response = await fetch('/api/contracts/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId: contract?.id,
          transactionHash: transactionHash,
          smartContractAddress: getHedwigContractAddress(),
          blockchainProjectId: createdContractId
        }),
      });

      if (response.ok) {
        setContractStep('completed');
        console.log('[Contract Page] Contract funded and status updated successfully');

        // Show success message and reload page
        setTimeout(() => {
          router.reload();
        }, 3000); // Wait 3 seconds to show success message
      } else {
        console.error('Failed to update contract status');
        setContractStep('idle');
        setIsSigningContract(false);
      }
    } catch (error) {
      console.error('Error handling contract funding:', error);
      setContractStep('idle');
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

    if (!address) {
      console.error('[Contract Page] No wallet address found');
      alert('❌ Wallet address not found. Please reconnect your wallet.');
      setIsSigningContract(false);
      // Try to reconnect the wallet
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
      console.log('[Contract Page] Creating project in Hedwig contract with ID:', contract.id);
      console.log('[Contract Page] Connected wallet address:', address);
      console.log('[Contract Page] Chain ID:', chainId);

      // Get the Hedwig project contract address based on chain
      const getHedwigContractAddress = () => {
        if (contract.chain === 'base') {
          // Use testnet for Base as requested
          return process.env.NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS_BASE_SEPOLIA;
        } else if (contract.chain === 'celo') {
          return process.env.NEXT_PUBLIC_HEDWIG_PROJECT_CONTRACT_ADDRESS_CELO_MAINNET;
        }
        throw new Error(`Unsupported chain: ${contract.chain}`);
      };

      const hedwigContractAddress = getHedwigContractAddress();

      if (!hedwigContractAddress) {
        throw new Error('Hedwig contract address not found for this chain');
      }

      // Convert amount to wei (USDC has 6 decimals)
      const amountInWei = BigInt(contract.total_amount * Math.pow(10, 6));

      // Get freelancer wallet from contract - must be a real address, no placeholders
      const freelancerWallet = contract.freelancer_wallet;
      if (!freelancerWallet) {
        throw new Error(`Freelancer wallet address is required. Freelancer ID: ${contract.freelancer_id || 'Not found'}. The freelancer needs to sign up and connect their wallet.`);
      }
      if (freelancerWallet.length !== 42 || !/^0x[a-fA-F0-9]{40}$/.test(freelancerWallet)) {
        throw new Error(`Invalid freelancer wallet address format: ${freelancerWallet}. Please ensure the freelancer provides a valid Ethereum wallet address.`);
      }

      // Hedwig Project Contract ABI for createContract function
      const hedwigProjectABI = [
        {
          "inputs": [
            { "name": "_client", "type": "address" },
            { "name": "_freelancer", "type": "address" },
            { "name": "_projectTitle", "type": "string" },
            { "name": "_amount", "type": "uint256" },
            { "name": "_token", "type": "address" },
            { "name": "_deadline", "type": "uint256" }
          ],
          "name": "createContract",
          "outputs": [{ "name": "", "type": "uint256" }],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ];



      // Get token address for the transaction
      const tokenAddress = contract.chain === 'base'
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // USDC on Base Sepolia testnet
        : '0x765DE816845861e75A25fCA122bb6898B8B1282a'; // cUSD on Celo

      console.log('[Contract Page] Transaction details:', {
        client: address,
        freelancer: freelancerWallet,
        title: contract.project_title,
        amount: amountInWei.toString(),
        token: tokenAddress,
        deadline: BigInt(Math.floor(new Date(contract.deadline).getTime() / 1000)).toString()
      });

      // Step 1: Create the contract (no funds transferred yet)
      setContractStep('creating');

      // Validate wallet connection
      if (!address) {
        throw new Error('Wallet not connected properly');
      }

      // Validate address format
      if (!address.startsWith('0x') || address.length !== 42) {
        throw new Error('Invalid wallet address format');
      }

      // Double-check wallet connection before proceeding
      console.log('[Contract Page] About to call writeContract with address:', address);
      console.log('[Contract Page] isConnected:', isConnected);
      console.log('[Contract Page] chainId:', chainId);

      // Wait a moment to ensure wallet is fully connected
      await new Promise(resolve => setTimeout(resolve, 100));

      writeContract({
        address: hedwigContractAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              { "name": "_client", "type": "address" },
              { "name": "_freelancer", "type": "address" },
              { "name": "_title", "type": "string" },
              { "name": "_amount", "type": "uint256" },
              { "name": "_tokenAddress", "type": "address" },
              { "name": "_deadline", "type": "uint256" }
            ],
            "name": "createContract",
            "outputs": [{ "name": "", "type": "uint256" }],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'createContract',
        args: [
          address as `0x${string}`, // client (current user)
          freelancerWallet as `0x${string}`, // freelancer
          contract.project_title, // title
          amountInWei, // amount in wei
          tokenAddress as `0x${string}`, // token address
          BigInt(Math.floor(new Date(contract.deadline).getTime() / 1000)) // deadline as unix timestamp
        ]
      });

      console.log('[Contract Page] Step 1: Contract creation transaction initiated');
      console.log('[Contract Page] Current state:', {
        isSigningContract,
        contractStep,
        isPending,
        isConfirming,
        hash
      });

    } catch (error) {
      console.error('Contract signing error:', error);
      alert(`❌ Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                <label className="text-sm font-medium text-gray-500">Freelancer Name</label>
                <p className="text-gray-900 font-medium">{contract.legal_contract?.freelancer_name || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Start Date</label>
                <p className="text-gray-900 font-medium">{formatDate(contract.created_at)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Deadline</label>
                <p className="text-gray-900 font-medium">{formatDate(contract.deadline)}</p>
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
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-green-600 font-medium">Live</span>
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

        {/* Debug Info - only show when transaction is in progress */}
        {(contractStep !== 'idle' || isPending || isConfirming) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-blue-800 mb-2">Transaction Status</h3>
            <div className="text-xs text-blue-700 space-y-1">
              <p>Step: {contractStep}</p>
              <p>Signing: {isSigningContract ? 'Yes' : 'No'}</p>
              <p>Pending: {isPending ? 'Yes' : 'No'}</p>
              <p>Confirming: {isConfirming ? 'Yes' : 'No'}</p>
              {hash && <p>Hash: {hash.slice(0, 10)}...{hash.slice(-8)}</p>}
            </div>
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
                    disabled={isSigningContract || isPending || isConfirming || contractStep !== 'idle'}
                    className="bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium w-[400px] h-[44px] flex items-center justify-center text-sm"
                  >
                    {contractStep === 'creating' ? 'Creating Contract...' :
                      contractStep === 'approving' ? 'Approving USDC...' :
                        contractStep === 'funding' ? 'Funding Contract...' :
                          contractStep === 'completed' ? 'Contract Funded!' :
                            isSigningContract ? 'Connecting Wallet...' :
                              isPending ? 'Confirm in Wallet...' :
                                isConfirming ? 'Confirming Transaction...' :
                                  'Make Payment'}
                  </button>

                  {/* Reset button - only show when transaction is in progress */}
                  {(contractStep !== 'idle' && contractStep !== 'completed') && (
                    <button
                      onClick={() => {
                        console.log('[Contract Page] Manual reset triggered');
                        if (transactionTimeout) {
                          clearTimeout(transactionTimeout);
                          setTransactionTimeout(null);
                        }
                        setIsSigningContract(false);
                        setContractStep('idle');
                      }}
                      className="bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium w-[100px] h-[44px] flex items-center justify-center text-sm"
                      title="Reset transaction state"
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
                <h3 className="text-sm font-medium text-green-800">
                  {contractStep === 'completed' ? 'Contract Funded Successfully!' : 'Transaction Confirmed!'}
                </h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>
                    {contractStep === 'completed'
                      ? 'Your project has been created and funded in the Hedwig smart contract escrow. Funds are now securely held until milestones are completed.'
                      : contractStep === 'creating'
                        ? 'Contract structure created. Next: USDC approval...'
                        : contractStep === 'approving'
                          ? 'USDC spending approved. Next: funding contract...'
                          : 'Transaction confirmed on the blockchain.'
                    }
                  </p>
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