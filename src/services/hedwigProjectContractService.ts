import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, celo } from 'viem/chains';

// Hedwig Project Contract ABI (simplified for the functions we need)
const HEDWIG_PROJECT_CONTRACT_ABI = [
  {
    "inputs": [
      {"name": "_client", "type": "address"},
      {"name": "_freelancer", "type": "address"},
      {"name": "_amount", "type": "uint256"},
      {"name": "_token", "type": "address"},
      {"name": "_deadline", "type": "uint256"},
      {"name": "_projectTitle", "type": "string"},
      {"name": "_projectDescription", "type": "string"}
    ],
    "name": "createProject",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "_projectId", "type": "uint256"}],
    "name": "approveProject",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"name": "_projectId", "type": "uint256"}],
    "name": "completeProject",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "_projectId", "type": "uint256"}],
    "name": "refundProject",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "", "type": "uint256"}],
    "name": "projects",
    "outputs": [
      {"name": "client", "type": "address"},
      {"name": "freelancer", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "token", "type": "address"},
      {"name": "deadline", "type": "uint256"},
      {"name": "isCompleted", "type": "bool"},
      {"name": "isApproved", "type": "bool"},
      {"name": "projectTitle", "type": "string"},
      {"name": "projectDescription", "type": "string"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export interface ProjectContractParams {
  client: string;
  freelancer: string;
  amount: string; // in wei
  token: string; // token contract address
  deadline: number; // unix timestamp
  projectTitle: string;
  projectDescription: string;
}

export interface ProjectContractResult {
  success: boolean;
  projectId?: number;
  transactionHash?: string;
  contractAddress?: string;
  error?: string;
}

class HedwigProjectContractService {
  
  private getContractAddress(chain: string, isTestnet: boolean = false): string {
    if (chain === 'base') {
      return isTestnet 
        ? process.env.HEDWIG_PROJECT_CONTRACT_ADDRESS_BASE_SEPOLIA!
        : process.env.HEDWIG_PROJECT_CONTRACT_ADDRESS_BASE_MAINNET!;
    } else if (chain === 'celo') {
      return process.env.HEDWIG_PROJECT_CONTRACT_ADDRESS_CELO_MAINNET!;
    }
    throw new Error(`Unsupported chain: ${chain}`);
  }

  private getChainConfig(chain: string, isTestnet: boolean = false) {
    if (chain === 'base') {
      return {
        chain: isTestnet ? baseSepolia : base,
        rpcUrl: isTestnet 
          ? process.env.BASE_SEPOLIA_RPC_URL!
          : process.env.BASE_MAINNET_RPC_URL!
      };
    } else if (chain === 'celo') {
      return {
        chain: celo,
        rpcUrl: process.env.CELO_RPC_URL!
      };
    }
    throw new Error(`Unsupported chain: ${chain}`);
  }

  private getTokenAddress(tokenType: string, chain: string): string {
    const tokenAddresses: Record<string, Record<string, string>> = {
      base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        ETH: '0x0000000000000000000000000000000000000000'
      },
      celo: {
        cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
        CELO: '0x0000000000000000000000000000000000000000'
      }
    };

    return tokenAddresses[chain]?.[tokenType] || tokenAddresses.base.USDC;
  }

  /**
   * Create a new project in the Hedwig Project Contract
   */
  async createProject(
    params: ProjectContractParams,
    chain: string,
    isTestnet: boolean = false
  ): Promise<ProjectContractResult> {
    try {
      console.log('[HedwigProjectContract] Creating project:', params);

      const contractAddress = this.getContractAddress(chain, isTestnet);
      const chainConfig = this.getChainConfig(chain, isTestnet);

      // Create wallet client for transactions
      const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: chainConfig.chain,
        transport: http(chainConfig.rpcUrl)
      });

      // Create public client for reading
      const publicClient = createPublicClient({
        chain: chainConfig.chain,
        transport: http(chainConfig.rpcUrl)
      });

      // Call createProject function
      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi: HEDWIG_PROJECT_CONTRACT_ABI,
        functionName: 'createProject',
        args: [
          params.client as `0x${string}`,
          params.freelancer as `0x${string}`,
          BigInt(params.amount),
          params.token as `0x${string}`,
          BigInt(params.deadline),
          params.projectTitle,
          params.projectDescription
        ]
      });

      console.log('[HedwigProjectContract] Transaction sent:', hash);

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log('[HedwigProjectContract] Transaction confirmed:', receipt);

      // Extract project ID from logs (assuming it's emitted in an event)
      // For now, we'll use a timestamp-based ID as fallback
      const projectId = Date.now();

      return {
        success: true,
        projectId,
        transactionHash: hash,
        contractAddress
      };

    } catch (error) {
      console.error('[HedwigProjectContract] Error creating project:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get project details from the contract
   */
  async getProject(
    projectId: number,
    chain: string,
    isTestnet: boolean = false
  ): Promise<any> {
    try {
      const contractAddress = this.getContractAddress(chain, isTestnet);
      const chainConfig = this.getChainConfig(chain, isTestnet);

      const publicClient = createPublicClient({
        chain: chainConfig.chain,
        transport: http(chainConfig.rpcUrl)
      });

      const project = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: HEDWIG_PROJECT_CONTRACT_ABI,
        functionName: 'projects',
        args: [BigInt(projectId)]
      });

      return project;
    } catch (error) {
      console.error('[HedwigProjectContract] Error getting project:', error);
      return null;
    }
  }
}

export const hedwigProjectContractService = new HedwigProjectContractService();