import { loadServerEnvironment } from './serverEnv';

// Load environment variables
loadServerEnvironment();

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string; // in wei for ETH, lamports for SOL
  token?: string;
  tokenAddress?: string;
  blockNumber: number;
  timestamp: number;
  network: string;
  category: 'native' | 'token';
  decimals?: number;
  symbol?: string;
}

export interface TransactionHistoryFilter {
  address: string;
  network: string;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  direction?: 'incoming' | 'outgoing' | 'both';
  tokenAddress?: string;
}

/**
 * Fetch transaction history for a wallet address
 */
export async function getTransactionHistory(filter: TransactionHistoryFilter): Promise<Transaction[]> {
  try {
    console.log('[getTransactionHistory] Fetching transactions for:', filter);

    const { address, network, startDate, endDate, direction = 'incoming' } = filter;

    // Determine which API to use based on network
    if (network.includes('solana')) {
      return await getSolanaTransactionHistory(filter);
    } else {
      return await getEvmTransactionHistory(filter);
    }
  } catch (error) {
    console.error('[getTransactionHistory] Error:', error);
    throw error;
  }
}

/**
 * Fetch EVM transaction history using Alchemy API
 */
async function getEvmTransactionHistory(filter: TransactionHistoryFilter): Promise<Transaction[]> {
  try {
    const { address, network, startDate, endDate, direction } = filter;
    
    // Map network to Alchemy network
    const alchemyNetwork = mapNetworkToAlchemy(network);
    const alchemyApiKey = process.env.ALCHEMY_API_KEY;
    
    if (!alchemyApiKey) {
      console.warn('[getEvmTransactionHistory] No Alchemy API key found, returning empty array');
      return [];
    }

    // Try to use specific environment variable for the network first
    let alchemyUrl: string;
    
    if (network.toLowerCase() === 'ethereum-mainnet' || network.toLowerCase() === 'ethereum') {
      alchemyUrl = process.env.ALCHEMY_URL_ETH_MAINNET || `https://${alchemyNetwork}.g.alchemy.com/v2/${alchemyApiKey}`;
    } else if (network.toLowerCase() === 'base-mainnet' || network.toLowerCase() === 'base') {
      alchemyUrl = process.env.ALCHEMY_URL_BASE_MAINNET || `https://${alchemyNetwork}.g.alchemy.com/v2/${alchemyApiKey}`;
    } else if (network.toLowerCase() === 'ethereum-sepolia') {
      alchemyUrl = process.env.ALCHEMY_URL_ETH_SEPOLIA || `https://${alchemyNetwork}.g.alchemy.com/v2/${alchemyApiKey}`;
    } else if (network.toLowerCase() === 'base') {
    alchemyUrl = process.env.ALCHEMY_URL_BASE_MAINNET || `https://${alchemyNetwork}.g.alchemy.com/v2/${alchemyApiKey}`;
    } else {
      alchemyUrl = `https://${alchemyNetwork}.g.alchemy.com/v2/${alchemyApiKey}`;
    }
    
    console.log(`[getEvmTransactionHistory] Using Alchemy URL: ${alchemyUrl.replace(alchemyApiKey, '***')} for network: ${network}`);
    
    // Convert dates to block numbers if provided
    let fromBlock = 'earliest';
    let toBlock = 'latest';
    
    if (startDate) {
      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      fromBlock = await getBlockByTimestamp(alchemyUrl, startTimestamp, 'after');
    }
    
    if (endDate) {
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
      toBlock = await getBlockByTimestamp(alchemyUrl, endTimestamp, 'before');
    }

    // Fetch asset transfers using Alchemy's getAssetTransfers
    const transfers = await fetchAssetTransfers(alchemyUrl, {
      fromBlock,
      toBlock,
      toAddress: direction === 'incoming' || direction === 'both' ? address : undefined,
      fromAddress: direction === 'outgoing' || direction === 'both' ? address : undefined,
      category: ['external', 'erc20', 'erc721', 'erc1155'],
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: '0x3e8' // 1000 transactions
    });

    // Convert to our Transaction format
    const transactions: Transaction[] = [];
    
    for (const transfer of transfers) {
      // Skip outgoing transactions if we only want incoming
      if (direction === 'incoming' && transfer.from.toLowerCase() === address.toLowerCase()) {
        continue;
      }
      
      // Skip incoming transactions if we only want outgoing
      if (direction === 'outgoing' && transfer.to?.toLowerCase() === address.toLowerCase()) {
        continue;
      }

      const transaction: Transaction = {
        hash: transfer.hash,
        from: transfer.from,
        to: transfer.to || '',
        value: transfer.rawContract?.value || transfer.value || '0',
        blockNumber: parseInt(transfer.blockNum, 16),
        timestamp: 0, // Will be filled by getBlockTimestamp
        network: network,
        category: transfer.category === 'external' ? 'native' : 'token',
        token: transfer.asset || 'ETH',
        tokenAddress: transfer.rawContract?.address,
        decimals: transfer.rawContract?.decimal ? parseInt(transfer.rawContract.decimal, 16) : 18,
        symbol: transfer.asset || 'ETH'
      };

      // Get block timestamp
      try {
        transaction.timestamp = await getBlockTimestamp(alchemyUrl, transfer.blockNum);
      } catch (error) {
        console.warn('[getEvmTransactionHistory] Could not get block timestamp:', error);
        transaction.timestamp = Date.now() / 1000; // Fallback to current time
      }

      transactions.push(transaction);
    }

    // Sort by timestamp descending (newest first)
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[getEvmTransactionHistory] Found ${transactions.length} transactions for ${address}`);
    return transactions;

  } catch (error) {
    console.error('[getEvmTransactionHistory] Error:', error);
    return [];
  }
}

/**
 * Fetch Solana transaction history using Solana RPC
 */
async function getSolanaTransactionHistory(filter: TransactionHistoryFilter): Promise<Transaction[]> {
  try {
    const { address, network, startDate, endDate, direction } = filter;
    
    // Use Solana RPC endpoint from environment variables if available
    let rpcUrl: string;
    if (network.includes('devnet')) {
    rpcUrl = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
    } else {
      rpcUrl = process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
    }
    
    console.log(`[getSolanaTransactionHistory] Using RPC URL: ${rpcUrl} for network: ${network}`);

    // Fetch transaction signatures
    const signatures = await fetchSolanaSignatures(rpcUrl, address, startDate, endDate);
    
    // Fetch transaction details
    const transactions: Transaction[] = [];
    
    for (const sig of signatures.slice(0, 100)) { // Limit to 100 transactions
      try {
        const txDetails = await fetchSolanaTransaction(rpcUrl, sig.signature);
        
        if (!txDetails) continue;

        // Parse transaction for transfers
        const transfers = parseSolanaTransaction(txDetails, address, direction || 'incoming');
        transactions.push(...transfers);
        
      } catch (error) {
        console.warn('[getSolanaTransactionHistory] Error fetching transaction:', sig.signature, error);
      }
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[getSolanaTransactionHistory] Found ${transactions.length} transactions for ${address}`);
    return transactions;

  } catch (error) {
    console.error('[getSolanaTransactionHistory] Error:', error);
    return [];
  }
}

/**
 * Helper functions for Alchemy API
 */
function mapNetworkToAlchemy(network: string): string {
  switch (network.toLowerCase()) {
    case 'base':
    case 'base-mainnet':
      return 'base-mainnet';
    case 'base':
      return 'base';
    case 'ethereum':
    case 'ethereum-mainnet':
      return 'eth-mainnet';
    case 'ethereum-sepolia':
      return 'eth-sepolia';
    case 'polygon':
      return 'polygon-mainnet';
    case 'optimism-sepolia':
      return 'opt-sepolia';
    case 'celo-alfajores':
      return 'celo-alfajores';
    case 'optimism':
      return 'opt-mainnet';
    // DISABLED NETWORKS: BEP20 and Asset Chain are not yet active
    // case 'bsc':
    // case 'bsc-mainnet':
    //   return 'bsc-mainnet';
    // case 'bsc-testnet':
    //   return 'bsc-testnet';
    // case 'asset-chain':
    // case 'asset-chain-mainnet':
    //   return 'asset-chain-mainnet';
    // case 'asset-chain-testnet':
    //   return 'asset-chain-testnet';
    default:
      // If network contains 'mainnet', use eth-mainnet as fallback
      if (network.toLowerCase().includes('mainnet')) {
        return 'eth-mainnet';
      }
      // Otherwise default to mainnet
    return 'base';
  }
}

async function fetchAssetTransfers(alchemyUrl: string, params: any): Promise<any[]> {
  const response = await fetch(alchemyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'alchemy_getAssetTransfers',
      params: [params]
    })
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Alchemy API error: ${data.error.message}`);
  }

  return data.result?.transfers || [];
}

async function getBlockByTimestamp(alchemyUrl: string, timestamp: number, closest: 'before' | 'after'): Promise<string> {
  // This is a simplified implementation - in production you'd want to use binary search
  // For now, we'll just return a reasonable block number based on average block time
  const currentTime = Math.floor(Date.now() / 1000);
  const timeDiff = currentTime - timestamp;
  const avgBlockTime = 2; // 2 seconds for Base/Ethereum
  const blockDiff = Math.floor(timeDiff / avgBlockTime);
  
  // Get current block number
  const response = await fetch(alchemyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: []
    })
  });

  const data = await response.json();
  const currentBlock = parseInt(data.result, 16);
  const targetBlock = Math.max(0, currentBlock - blockDiff);
  
  return `0x${targetBlock.toString(16)}`;
}

async function getBlockTimestamp(alchemyUrl: string, blockNumber: string): Promise<number> {
  const response = await fetch(alchemyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: [blockNumber, false]
    })
  });

  const data = await response.json();
  return parseInt(data.result?.timestamp, 16) || 0;
}

/**
 * Helper functions for Solana RPC
 */
async function fetchSolanaSignatures(rpcUrl: string, address: string, startDate?: string, endDate?: string): Promise<any[]> {
  const params: any = {
    limit: 100
  };

  // Add time filtering if provided
  if (startDate) {
    params.before = Math.floor(new Date(startDate).getTime() / 1000);
  }
  if (endDate) {
    params.until = Math.floor(new Date(endDate).getTime() / 1000);
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, params]
    })
  });

  const data = await response.json();
  return data.result || [];
}

async function fetchSolanaTransaction(rpcUrl: string, signature: string): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
    })
  });

  const data = await response.json();
  return data.result;
}

function parseSolanaTransaction(txDetails: any, address: string, direction: string): Transaction[] {
  const transactions: Transaction[] = [];
  
  if (!txDetails?.meta || !txDetails?.transaction) {
    return transactions;
  }

  const { meta, transaction, blockTime } = txDetails;
  const { message } = transaction;

  // Parse SOL transfers from pre/post balances
  const accountKeys = message.accountKeys.map((key: any) => 
    typeof key === 'string' ? key : key.pubkey
  );
  
  const addressIndex = accountKeys.indexOf(address);
  if (addressIndex !== -1) {
    const preBalance = meta.preBalances[addressIndex] || 0;
    const postBalance = meta.postBalances[addressIndex] || 0;
    const balanceChange = postBalance - preBalance;

    if (balanceChange !== 0) {
      // Determine if this is incoming or outgoing
      const isIncoming = balanceChange > 0;
      
      if ((direction === 'incoming' && isIncoming) || 
          (direction === 'outgoing' && !isIncoming) ||
          direction === 'both') {
        
        transactions.push({
          hash: txDetails.transaction.signatures[0],
          from: isIncoming ? 'unknown' : address,
          to: isIncoming ? address : 'unknown',
          value: Math.abs(balanceChange).toString(),
          blockNumber: txDetails.slot || 0,
          timestamp: blockTime || 0,
          network: 'solana',
          category: 'native',
          token: 'SOL',
          decimals: 9,
          symbol: 'SOL'
        });
      }
    }
  }

  // Parse token transfers from parsed instructions
  if (meta.innerInstructions) {
    for (const innerInstruction of meta.innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        if (instruction.parsed?.type === 'transfer' && instruction.parsed?.info) {
          const info = instruction.parsed.info;
          const isIncoming = info.destination === address;
          const isOutgoing = info.source === address;

          if ((direction === 'incoming' && isIncoming) || 
              (direction === 'outgoing' && isOutgoing) ||
              direction === 'both') {
            
            transactions.push({
              hash: txDetails.transaction.signatures[0],
              from: info.source,
              to: info.destination,
              value: info.amount,
              blockNumber: txDetails.slot || 0,
              timestamp: blockTime || 0,
              network: 'solana',
              category: 'token',
              token: 'USDC', // This would need to be determined from the mint address
              tokenAddress: info.mint,
              decimals: 6, // USDC has 6 decimals
              symbol: 'USDC'
            });
          }
        }
      }
    }
  }

  return transactions;
}

export default {
  getTransactionHistory
};