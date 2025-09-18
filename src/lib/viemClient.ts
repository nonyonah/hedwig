import { createWalletClient, createPublicClient, http, parseEther, parseUnits, formatUnits } from 'viem';
import { toAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import { CdpClient } from '@coinbase/cdp-sdk';
import { loadServerEnvironment } from './serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

// Define Celo Sepolia chain
const celoSepolia = defineChain({
  id: 11142220,
  name: 'Celo Sepolia',
  network: 'celo-sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Celo',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: {
      http: ['https://forno.celo-sepolia.celo-testnet.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Celo Sepolia Explorer',
      url: 'https://celo-sepolia.blockscout.com',
    },
  },
});

// Define Lisk Sepolia chain
const liskSepolia = defineChain({
  id: 4202,
  name: 'Lisk Sepolia',
  network: 'lisk-sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia-api.lisk.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Lisk Sepolia Explorer',
      url: 'https://sepolia-blockscout.lisk.com',
    },
  },
});

// Define Celo Mainnet chain
const celo = defineChain({
  id: 42220,
  name: 'Celo',
  network: 'celo',
  nativeCurrency: {
    decimals: 18,
    name: 'Celo',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: {
      http: ['https://forno.celo.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Celo Explorer',
      url: 'https://celoscan.io',
    },
  },
});

// Define Lisk Mainnet chain
const lisk = defineChain({
  id: 1135,
  name: 'Lisk',
  network: 'lisk',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.api.lisk.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Lisk Explorer',
      url: 'https://blockscout.lisk.com',
    },
  },
});

// Chain mapping
const CHAIN_MAP = {
  'celo-sepolia': celoSepolia,
  'lisk-sepolia': liskSepolia,
  'celo': celo,
  'lisk': lisk,
};

// Token contract addresses
const TOKEN_CONTRACTS = {
  'celo-sepolia': {
    'USDC': '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
    'cUSD': '0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80',
    'CELO_TOKEN': '0x77F6a7215B27688Ab4a660EDbfB1DC88aFa2Dd68',
  },
  'lisk-sepolia': {
    'USDT': '0x2728DD8B45B788e26d12B13Db5A244e5403e7eda',
    'LISK': '0x625eB34C6bebd89ebfC41B9b3D0430BAcb37b9F8',
  },
  'celo': {
    'USDC': '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    'CELO': '0x471EcE3750Da237f93B8E339c536989b8978a438',
  },
  'lisk': {
    // Add Lisk mainnet token addresses when available
  },
};

// Initialize CDP client with proper authentication
const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  walletSecret: process.env.CDP_WALLET_SECRET,
});

/**
 * Send native token using viem
 */
export async function sendNativeTokenViem(
  fromAddress: string,
  toAddress: string,
  amount: string,
  network: 'celo-sepolia' | 'lisk-sepolia' | 'celo' | 'lisk',
  accountName?: string
): Promise<string> {
  console.log(`[VIEM] Initiating native token transfer on ${network}...`);
  
  const chain = CHAIN_MAP[network];
  if (!chain) {
    throw new Error(`Unsupported network: ${network}`);
  }

  // Format the address to create a valid account name for CDP
  // CDP requires alphanumeric characters and hyphens, between 2 and 36 characters
  let finalAccountName = accountName;
  if (!finalAccountName) {
    finalAccountName = fromAddress.toLowerCase().replace(/[^a-zA-Z0-9-]/g, '');
    if (finalAccountName.length > 36) {
      finalAccountName = finalAccountName.substring(0, 36);
    }
    if (finalAccountName.length < 2) {
      finalAccountName = 'addr-' + finalAccountName;
    }
  }
  
  // Get or create CDP account using the formatted account name
  const account = await cdp.evm.getOrCreateAccount({ name: finalAccountName });
  console.log(`[VIEM] CDP account retrieved: ${account.address}`);

  // Create viem wallet client using CDP account
  const walletClient = createWalletClient({
    account: toAccount(account),
    chain,
    transport: http(),
  });

  // Create public client for transaction confirmation
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  console.log(`[VIEM] Sending ${amount} native tokens to ${toAddress}...`);
  
  // Prepare transaction parameters
  const txParams: any = {
    account: toAccount(account),
    chain,
    to: toAddress as `0x${string}`,
    value: parseUnits(String(amount), 18),
    gas: BigInt(21000), // Standard gas limit for native transfers
    kzg: undefined,
  };

  console.log(`[VIEM] Using native CELO for gas fees (no feeCurrency specified)`);
  
  // Send transaction
  const hash = await walletClient.sendTransaction(txParams);

  console.log(`[VIEM] Transaction sent with hash: ${hash}`);

  // Wait for transaction confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[VIEM] Transaction confirmed in block: ${receipt.blockNumber}`);

  return hash;
}

/**
 * Send ERC-20 token using viem
 */
export async function sendTokenViem(
  fromAddress: string,
  toAddress: string,
  amount: string,
  tokenSymbol: string,
  network: 'celo-sepolia' | 'lisk-sepolia' | 'celo' | 'lisk',
  decimals: number = 18,
  accountName?: string
): Promise<string> {
  console.log(`[VIEM] Initiating ${tokenSymbol} token transfer on ${network}...`);
  
  const chain = CHAIN_MAP[network];
  if (!chain) {
    throw new Error(`Unsupported network: ${network}`);
  }

  // Get token contract address
  const tokenAddress = TOKEN_CONTRACTS[network]?.[tokenSymbol];
  if (!tokenAddress) {
    throw new Error(`Token ${tokenSymbol} not supported on ${network}`);
  }

  // Format the address to create a valid account name for CDP
  // CDP requires alphanumeric characters and hyphens, between 2 and 36 characters
  let finalAccountName = accountName;
  if (!finalAccountName) {
    finalAccountName = fromAddress.toLowerCase().replace(/[^a-zA-Z0-9-]/g, '');
    if (finalAccountName.length > 36) {
      finalAccountName = finalAccountName.substring(0, 36);
    }
    if (finalAccountName.length < 2) {
      finalAccountName = 'addr-' + finalAccountName;
    }
  }
  
  // Get or create CDP account using the formatted account name
  const account = await cdp.evm.getOrCreateAccount({ name: finalAccountName });
  console.log(`[VIEM] CDP account retrieved: ${account.address}`);

  // Create viem wallet client using CDP account
  const walletClient = createWalletClient({
    account: toAccount(account),
    chain,
    transport: http(),
  });

  // Create public client for transaction confirmation
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  // Parse amount with correct decimals
  const parsedAmount = parseUnits(String(amount), decimals);

  console.log(`[VIEM] Sending ${amount} ${tokenSymbol} to ${toAddress}...`);
  
  // ERC-20 transfer function signature: transfer(address,uint256)
  const transferData = `0xa9059cbb${toAddress.slice(2).padStart(64, '0')}${parsedAmount.toString(16).padStart(64, '0')}`;

  // Send transaction
  const hash = await walletClient.sendTransaction({
    account: toAccount(account),
    chain,
    to: tokenAddress as `0x${string}`,
    data: transferData as `0x${string}`,
    gas: BigInt(65000), // Standard gas limit for ERC-20 transfers
    kzg: undefined,
  });

  console.log(`[VIEM] Transaction sent with hash: ${hash}`);

  // Wait for transaction confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[VIEM] Transaction confirmed in block: ${receipt.blockNumber}`);

  return hash;
}

/**
 * Get token balance using viem
 */
export async function getTokenBalanceViem(
  address: string,
  tokenSymbol: string,
  network: 'celo-sepolia' | 'lisk-sepolia' | 'celo' | 'lisk',
  decimals: number = 18
): Promise<string> {
  const chain = CHAIN_MAP[network];
  if (!chain) {
    throw new Error(`Unsupported network: ${network}`);
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  if (tokenSymbol === 'ETH' || tokenSymbol === 'CELO') {
    // Get native token balance
    const balance = await publicClient.getBalance({
      address: address as `0x${string}`,
    });
    return formatUnits(balance, decimals);
  } else {
    // Get ERC-20 token balance
    const tokenAddress = TOKEN_CONTRACTS[network]?.[tokenSymbol];
    if (!tokenAddress) {
      throw new Error(`Token ${tokenSymbol} not supported on ${network}`);
    }

    // ERC-20 balanceOf function signature: balanceOf(address)
    const balanceOfData = `0x70a08231000000000000000000000000${address.slice(2)}`;

    const result = await publicClient.call({
      to: tokenAddress as `0x${string}`,
      data: balanceOfData as `0x${string}`,
    });

    if (!result.data || result.data === '0x') {
      return '0';
    }

    const balance = BigInt(result.data);
    return formatUnits(balance, decimals);
  }
}

/**
 * Estimate transaction fee for Celo/Lisk networks
 */
export async function estimateTransactionFeeViem(
  network: 'celo-sepolia' | 'lisk-sepolia' | 'celo' | 'lisk',
  transactionType: 'native' | 'token' = 'native'
): Promise<string> {
  try {
    const chain = CHAIN_MAP[network];
    if (!chain) {
      throw new Error(`Unsupported network: ${network}`);
    }

    const publicClient = createPublicClient({
      chain,
      transport: http()
    });

    // Get current gas price
    const gasPrice = await publicClient.getGasPrice();
    
    // Estimate gas limit based on transaction type
    // Native transfers typically cost ~21,000 gas
    // Token transfers typically cost ~65,000 gas
    const gasLimit = transactionType === 'native' ? BigInt(21000) : BigInt(65000);
    
    // Calculate total fee
    const totalFee = gasPrice * gasLimit;
    const feeInEth = formatUnits(totalFee, 18);
    
    // Determine the correct native token symbol for the network
    let nativeTokenSymbol: string;
    if (network === 'celo-sepolia' || network === 'celo') {
      nativeTokenSymbol = 'CELO';
    } else if (network === 'lisk-sepolia' || network === 'lisk') {
      nativeTokenSymbol = 'LSK'; // Lisk uses LSK as gas token
    } else {
      nativeTokenSymbol = 'ETH'; // fallback
    }
    
    return `~${parseFloat(feeInEth).toFixed(6)} ${nativeTokenSymbol}`;
  } catch (error) {
    console.error(`[viemClient] Failed to estimate fee for ${network}:`, error);
    // Return conservative fallback with correct token symbol
    const fallbackSymbol = (network === 'celo-sepolia' || network === 'celo') ? 'CELO' : 
                          (network === 'lisk-sepolia' || network === 'lisk') ? 'ETH' : 'ETH';
    return `~0.001 ${fallbackSymbol}`;
  }
}