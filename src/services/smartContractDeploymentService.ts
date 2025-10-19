import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { createPublicClient, createWalletClient, http, parseAbi, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, celo, celoAlfajores } from 'viem/chains';
import { supabase } from '../lib/supabase';

const execAsync = promisify(exec);

export interface DeploymentConfig {
  chain: 'base' | 'celo' | 'polygon' | 'base_sepolia' | 'celo_alfajores';
  platformWallet: string;
  platformFeeRate?: number;
  privateKey?: string;
}

export interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  gasUsed: string;
  deploymentCost: string;
  networkName: string;
  chainId: number;
}

export interface ContractDeploymentParams {
  client: string;
  freelancer: string;
  token: string;
  totalAmount: string;
  platformFee: string;
  deadline: number;
  projectTitle: string;
  projectDescription: string;
  legalContractHash: string;
  milestones?: Array<{
    description: string;
    amount: string;
    deadline: number;
  }>;
}

class SmartContractDeploymentService {
  private readonly projectRoot: string;
  private readonly foundryPath: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.foundryPath = 'forge'; // Assumes forge is in PATH
  }

  /**
   * Deploy the HedwigProjectContract factory to a specific network
   */
  async deployProjectContractFactory(config: DeploymentConfig): Promise<DeploymentResult> {
    try {
      console.log(`Deploying HedwigProjectContract factory to ${config.chain}...`);

      // Prepare environment variables
      const env = {
        ...process.env,
        PRIVATE_KEY: config.privateKey || process.env.PRIVATE_KEY,
        PLATFORM_WALLET: config.platformWallet,
        PLATFORM_FEE_RATE: (config.platformFeeRate || 100).toString(),
      };

      // Build the contract first
      await this.buildContracts();

      // Deploy using Foundry
      const deployCommand = `${this.foundryPath} script script/HedwigProjectContractDeploy.s.sol:HedwigProjectContractDeploy --rpc-url ${this.getRpcUrl(config.chain)} --broadcast --verify`;

      const { stdout, stderr } = await execAsync(deployCommand, {
        cwd: this.projectRoot,
        env,
      });

      console.log('Deployment output:', stdout);
      if (stderr) {
        console.warn('Deployment warnings:', stderr);
      }

      // Parse deployment result from output
      const deploymentResult = this.parseDeploymentOutput(stdout, config.chain);

      // Store deployment info in database
      await this.storeDeploymentInfo(deploymentResult, config);

      return deploymentResult;
    } catch (error) {
      console.error('Deployment failed:', error);
      throw new Error(`Failed to deploy contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deploy a new project contract instance
   */
  async deployProjectContract(
    factoryAddress: string,
    params: ContractDeploymentParams,
    config: DeploymentConfig
  ): Promise<{ contractId: number; transactionHash: string }> {
    try {
      if (!config.privateKey) {
        throw new Error('Private key is required for contract deployment');
      }

      const chain = this.getViemChain(config.chain);
      const account = privateKeyToAccount(config.privateKey as `0x${string}`);

      const publicClient = createPublicClient({
        chain,
        transport: http(this.getRpcUrl(config.chain)),
      });

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(this.getRpcUrl(config.chain)),
      });

      // Create the contract using wallet client directly
      const txHash = await walletClient.writeContract({
        address: factoryAddress as `0x${string}`,
        abi: this.getProjectContractAbi(),
        functionName: 'createContract',
        chain,
        args: [
          params.client as `0x${string}`,
          params.freelancer as `0x${string}`,
          params.token as `0x${string}`,
          BigInt(params.totalAmount),
          BigInt(params.platformFee),
          BigInt(params.deadline),
          params.projectTitle,
          params.projectDescription,
          params.legalContractHash,
        ],
      });

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Parse contract ID from logs
      const contractId = this.parseContractIdFromLogs(receipt.logs);

      // Add milestones if provided
      if (params.milestones && params.milestones.length > 0) {
        await this.addMilestones(factoryAddress, contractId, params.milestones, config);
      }

      return {
        contractId,
        transactionHash: txHash,
      };
    } catch (error) {
      console.error('Project contract deployment failed:', error);
      throw new Error(`Failed to deploy project contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deploy a payment contract using Foundry
   */
  async deployPaymentContract(config: DeploymentConfig): Promise<DeploymentResult> {
    try {
      await this.buildContracts();

      const deployCommand = `forge script script/HedwigPaymentDeploy.s.sol:HedwigPaymentDeploy --rpc-url ${this.getRpcUrl(config.chain)} --private-key ${config.privateKey} --broadcast --verify`;
      
      console.log(`Deploying HedwigPayment contract to ${config.chain}...`);
      const { stdout, stderr } = await execAsync(deployCommand, { 
        cwd: this.foundryPath,
        env: { ...process.env, PLATFORM_WALLET: config.platformWallet, PLATFORM_FEE_RATE: config.platformFeeRate?.toString() || '250' }
      });

      if (stderr && !stderr.includes('Warning')) {
        throw new Error(`Deployment failed: ${stderr}`);
      }

      const result = this.parsePaymentDeploymentOutput(stdout, config.chain);
      await this.storePaymentDeploymentInfo(result, config);
      
      return result;
    } catch (error) {
      console.error('Payment contract deployment failed:', error);
      throw new Error(`Failed to deploy payment contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get factory address for a specific chain
   */
  async getFactoryAddress(chain: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('contract_deployments')
        .select('contract_address')
        .eq('chain', chain)
        .eq('contract_type', 'factory')
        .eq('status', 'deployed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching factory address:', error);
        return null;
      }

      return data?.contract_address || null;
    } catch (error) {
      console.error('Failed to get factory address:', error);
      return null;
    }
  }

  /**
   * Build contracts using Foundry
   */
  private async buildContracts(): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync(`${this.foundryPath} build`, {
        cwd: this.projectRoot,
      });

      console.log('Build output:', stdout);
      if (stderr) {
        console.warn('Build warnings:', stderr);
      }
    } catch (error) {
      throw new Error(`Failed to build contracts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get RPC URL for a specific chain
   */
  private getRpcUrl(chain: string): string {
    const rpcUrls: Record<string, string> = {
      base: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
      base_sepolia: 'https://sepolia.base.org',
      celo: 'https://forno.celo.org',
      celo_alfajores: 'https://alfajores-forno.celo-testnet.org',
      polygon: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    };

    const url = rpcUrls[chain];
    if (!url) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    return url;
  }

  /**
   * Get Viem chain configuration
   */
  private getViemChain(chain: string) {
    const chains: Record<string, any> = {
      base,
      base_sepolia: baseSepolia,
      celo,
      celo_alfajores: celoAlfajores,
    };

    const viemChain = chains[chain];
    if (!viemChain) {
      throw new Error(`Unsupported chain for Viem: ${chain}`);
    }

    return viemChain;
  }

  /**
   * Parse deployment output to extract contract address and other details
   */
  private parseDeploymentOutput(output: string, chain: string): DeploymentResult {
    // This is a simplified parser - in production, you'd want more robust parsing
    const addressMatch = output.match(/HedwigProjectContract deployed to: (0x[a-fA-F0-9]{40})/);
    const txHashMatch = output.match(/Transaction hash: (0x[a-fA-F0-9]{64})/);
    const blockMatch = output.match(/Block number: (\d+)/);

    if (!addressMatch) {
      throw new Error('Could not parse contract address from deployment output');
    }

    return {
      contractAddress: addressMatch[1],
      transactionHash: txHashMatch?.[1] || '',
      blockNumber: blockMatch ? parseInt(blockMatch[1]) : 0,
      gasUsed: '0', // Would need to parse from actual output
      deploymentCost: '0', // Would need to calculate
      networkName: chain,
      chainId: this.getChainId(chain),
    };
  }

  /**
   * Get chain ID for a specific chain
   */
  private getChainId(chain: string): number {
    const chainIds: Record<string, number> = {
      base: 8453,
      base_sepolia: 84532,
      celo: 42220,
      celo_alfajores: 44787,
      polygon: 137,
    };

    return chainIds[chain] || 0;
  }

  /**
   * Store deployment information in database
   */
  private async storeDeploymentInfo(result: DeploymentResult, config: DeploymentConfig): Promise<void> {
    try {
      const { error } = await supabase.from('contract_deployments').insert({
        contract_address: result.contractAddress,
        chain: config.chain,
        contract_type: 'factory',
        deployment_tx_hash: result.transactionHash,
        block_number: result.blockNumber,
        gas_used: result.gasUsed,
        deployment_cost: result.deploymentCost,
        platform_wallet: config.platformWallet,
        platform_fee_rate: config.platformFeeRate || 100,
        status: 'deployed',
        deployed_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Failed to store deployment info:', error);
      }
    } catch (error) {
      console.error('Error storing deployment info:', error);
    }
  }

  /**
   * Add milestones to a deployed contract
   */
  private async addMilestones(
    factoryAddress: string,
    contractId: number,
    milestones: Array<{ description: string; amount: string; deadline: number }>,
    config: DeploymentConfig
  ): Promise<void> {
    // Implementation would depend on the contract's milestone management functions
    console.log(`Adding ${milestones.length} milestones to contract ${contractId}`);
    // This would involve calling the smart contract's addMilestone function
  }

  /**
   * Parse contract ID from transaction logs
   */
  private parseContractIdFromLogs(logs: any[]): number {
    // Implementation would parse the ContractCreated event logs
    // This is a placeholder - actual implementation would decode the logs
    return Math.floor(Math.random() * 1000000); // Temporary
  }

  /**
   * Parse payment contract deployment output
   */
  private parsePaymentDeploymentOutput(output: string, chain: string): DeploymentResult {
    // Parse the Foundry deployment output for HedwigPayment contract
    const lines = output.split('\n');
    let contractAddress = '';
    let transactionHash = '';
    let blockNumber = 0;
    let gasUsed = '';
    let deploymentCost = '';

    for (const line of lines) {
      if (line.includes('Contract Address:')) {
        contractAddress = line.split(':')[1]?.trim() || '';
      } else if (line.includes('Transaction Hash:')) {
        transactionHash = line.split(':')[1]?.trim() || '';
      } else if (line.includes('Block Number:')) {
        blockNumber = parseInt(line.split(':')[1]?.trim() || '0');
      } else if (line.includes('Gas Used:')) {
        gasUsed = line.split(':')[1]?.trim() || '0';
      } else if (line.includes('Deployment Cost:')) {
        deploymentCost = line.split(':')[1]?.trim() || '0';
      }
    }

    return {
      contractAddress,
      transactionHash,
      blockNumber,
      gasUsed,
      deploymentCost,
      networkName: chain,
      chainId: this.getChainId(chain)
    };
  }

  /**
   * Store payment contract deployment information
   */
  private async storePaymentDeploymentInfo(result: DeploymentResult, config: DeploymentConfig): Promise<void> {
    try {
      const { error } = await supabase
        .from('contract_deployments')
        .insert({
          contract_address: result.contractAddress,
          chain: config.chain,
          contract_type: 'payment',
          deployment_tx_hash: result.transactionHash,
          block_number: result.blockNumber,
          gas_used: result.gasUsed,
          deployment_cost: result.deploymentCost,
          platform_wallet: config.platformWallet,
          platform_fee_rate: config.platformFeeRate || 250,
          status: 'deployed',
          deployed_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to store payment deployment info:', error);
        throw new Error('Failed to store deployment information');
      }
    } catch (error) {
      console.error('Database storage error:', error);
      throw error;
    }
  }

  /**
   * Get the project contract ABI
   */
  private getProjectContractAbi() {
    // This would typically be loaded from the compiled contract artifacts
    // For now, returning a minimal ABI
    return parseAbi([
      'function createContract(address client, address freelancer, address token, uint256 totalAmount, uint256 platformFee, uint256 deadline, string projectTitle, string projectDescription, string legalContractHash) external returns (uint256)',
      'event ContractCreated(uint256 indexed contractId, address indexed client, address indexed freelancer)',
    ]);
  }
}

export const smartContractDeploymentService = new SmartContractDeploymentService();