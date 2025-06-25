import { getOrCreatePrivyWallet } from '@/lib/privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import {
  walletTemplates,
  walletCreated,
  swapPending,
  swapSuccessful,
  swapFailed,
  transactionSuccess,
  confirmTransaction,
  txPending,
  tokenReceived,
  bridgeFailed,
  sendSuccess,
  swapSuccess,
  bridgeSuccess,
  sendFailed,
  walletBalance,
  walletCreatedMulti,
  privateKeys,
  noWalletYet,
  textTemplate,
  usersWalletAddresses
} from '@/lib/whatsappTemplates';

// Example: Action handler interface
export type ActionParams = Record<string, any>;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Check if a user has wallets
 * @param userId User ID to check
 * @returns Object with hasWallet flag and wallet data if found
 */
async function checkUserWallets(userId: string) {
  // Check for both EVM and Solana wallets
  const { data: wallets, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error checking user wallets:', error);
    return { hasWallet: false, wallets: null };
  }

  const hasEvm = wallets?.some(w => w.chain === 'evm' || w.chain === 'base');
  const hasSolana = wallets?.some(w => w.chain === 'solana');
  
  return { 
    hasWallet: wallets && wallets.length > 0,
    hasEvm,
    hasSolana,
    wallets 
  };
}

/**
 * Verify user has wallets before proceeding with blockchain actions
 * @param userId User ID to check
 * @returns noWalletYet template if no wallet, or null if wallet exists
 */
async function verifyWalletExists(userId: string) {
  const { hasWallet } = await checkUserWallets(userId);
  if (!hasWallet) {
    return noWalletYet();
  }
  return null;
}

export async function handleAction(intent: string, params: ActionParams, userId: string) {
  console.log(`Handling intent: ${intent} with params:`, params);
  
  // Special case for clarification intent
  if (intent === 'clarification') {
    return { text: "I'm not sure what you're asking. Could you please rephrase your question?" };
  }
  
  // Handle unknown intent
  if (intent === 'unknown') {
    return { text: "I didn't understand your request. You can ask about creating a wallet, checking balance, sending crypto, swapping tokens, or getting crypto prices." };
  }

  // For blockchain-related intents, verify wallet first
  const blockchainIntents = [
    'get_wallet_balance', 'get_wallet_address', 'send', 'swap', 'bridge', 'export_keys'
  ];
  
  if (blockchainIntents.includes(intent)) {
    const walletCheck = await verifyWalletExists(userId);
    if (walletCheck) {
      return walletCheck; // Return noWalletYet template
    }
  }

  switch (intent) {
    case 'welcome':
      return await handleWelcome(userId);
    case 'create_wallets':
      return await handleCreateWallets(userId);
    case 'get_wallet_balance':
      return await handleGetWalletBalance(params, userId);
    case 'get_wallet_address':
      return await handleGetWalletAddress(userId);
    case 'send':
      return await handleSendTokens(params, userId);
    case 'swap':
      return await handleSwapTokens(params, userId);
    case 'bridge':
      return await handleBridge(params, userId);
    case 'export_keys':
      return await handleExportKeys(params, userId);
    case 'tx_pending':
      return txPending();
    case 'token_received':
      return tokenReceived({
        amount: params.amount,
        network: params.network,
        balance: params.balance
      });
    case 'bridge_failed':
      return bridgeFailed({
        reason: params.reason
      });
    case 'send_success':
      return sendSuccess({
        amount: params.amount,
        token: params.token,
        recipient: params.recipient,
        balance: params.balance,
        explorerUrl: params.explorerUrl
      });
    case 'swap_success':
      return swapSuccess({
        from_amount: params.from_amount,
        to_amount: params.to_amount,
        network: params.network,
        balance: params.balance,
        explorerUrl: params.explorerUrl
      });
    case 'bridge_success':
      return bridgeSuccess({
        amount: params.amount,
        from_network: params.from_network,
        to_network: params.to_network,
        balance: params.balance
      });
    case 'send_failed':
      return sendFailed({
        reason: params.reason
      });
    case 'wallet_balance':
      return walletBalance({
        eth_balance: params.eth_balance || '0',
        usdc_base_balance: params.usdc_base_balance || '0',
        sol_balance: params.sol_balance || '0',
        usdc_solana_balance: params.usdc_solana_balance || '0'
      });
    case 'wallet_created_multi':
      return walletCreatedMulti({
        evm_wallet: params.evm_wallet,
        solana_wallet: params.solana_wallet
      });
    case 'private_keys':
      return privateKeys({
        privy_link: params.privy_link
      });
    case 'no_wallet_yet':
      return noWalletYet();
    default:
      return { text: `Sorry, I don't know how to handle the action: ${intent}` };
  }
}

// Example handler for onboarding
async function handleWelcome(userId: string) {
  // If user has no wallet, show onboarding template
  const { hasWallet } = await checkUserWallets(userId);
  if (!hasWallet) {
    return noWalletYet();
  }
  // If user has wallets, show balances (or other main menu)
  return walletBalance({
    eth_balance: '0',
    usdc_base_balance: '0',
    sol_balance: '0',
    usdc_solana_balance: '0'
  });
}

// Handler for creating both EVM and Solana wallets simultaneously
async function handleCreateWallets(userId: string) {
  try {
    console.log(`Creating wallets for user ${userId}`);
    
    // Extract phone number from user record
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', userId)
      .single();
      
    if (userError) {
      console.error('Error fetching user:', userError);
      return { text: 'Error creating wallets. Please try again.' };
    }
    
    const phoneNumber = user?.phone_number || userId;
    
    // Create EVM wallet
    console.log('Creating EVM wallet...');
    const evmWallet = await getOrCreatePrivyWallet({
      userId,
      phoneNumber,
      chain: 'evm'
    });
    
    // Create Solana wallet
    console.log('Creating Solana wallet...');
    const solanaWallet = await getOrCreatePrivyWallet({
      userId,
      phoneNumber,
      chain: 'solana'
    });
    
    if (!evmWallet || !solanaWallet) {
      console.error('Failed to create one or both wallets');
      return { text: 'Error creating wallets. Please try again.' };
    }
    
    console.log('Wallets created successfully:', {
      evm: evmWallet.address,
      solana: solanaWallet.address
    });
    
    // Return wallet_created_multi template with actual addresses
    return walletCreatedMulti({
      evm_wallet: evmWallet.address,
      solana_wallet: solanaWallet.address
    });
  } catch (error) {
    console.error('Error in handleCreateWallets:', error);
    return { text: 'Error creating wallets. Please try again later.' };
  }
}

// Handler for getting wallet addresses
async function handleGetWalletAddress(userId: string) {
  try {
    console.log(`Getting wallet addresses for user ${userId}`);
    
    // Get EVM wallet
    const { data: evmWallet, error: evmError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'evm')
      .single();
      
    if (evmError) {
      console.error('Error fetching EVM wallet:', evmError);
    }
    
    // Get Solana wallet
    const { data: solanaWallet, error: solanaError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'solana')
      .single();
      
    if (solanaError) {
      console.error('Error fetching Solana wallet:', solanaError);
    }
    
    // Return wallet addresses template
    return usersWalletAddresses({
      evm_wallet: evmWallet?.address || 'Not created yet',
      solana_wallet: solanaWallet?.address || 'Not created yet'
    });
  } catch (error) {
    console.error('Error in handleGetWalletAddress:', error);
    return { text: 'Failed to get wallet addresses.' };
  }
}

// Example handler for wallet balance
async function handleGetWalletBalance(params: ActionParams, userId: string) {
  try {
    console.log(`Getting wallet balances for user ${userId}`);
    
    // Get EVM wallet
    const { data: evmWallet, error: evmError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'evm')
      .single();
      
    if (evmError) {
      console.error('Error fetching EVM wallet:', evmError);
    }
    
    // Get Solana wallet
    const { data: solanaWallet, error: solanaError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'solana')
      .single();
      
    if (solanaError) {
      console.error('Error fetching Solana wallet:', solanaError);
    }
    
    // TODO: Implement actual balance fetching from blockchain
    // For now, return placeholder balances
    return walletBalance({
      eth_balance: '0.007',
      usdc_base_balance: '21.22',
      sol_balance: '0.03',
      usdc_solana_balance: '24'
    });
  } catch (error) {
    console.error('Error in handleGetWalletBalance:', error);
    return { text: 'Failed to get wallet balance.' };
  }
}

// Example handler for sending tokens
async function handleSendTokens(params: ActionParams, userId: string) {
  // ... logic to send tokens ...
  return sendSuccess({ amount: '10', token: 'USDC', recipient: '0xabc...123', balance: '2 USDC', explorerUrl: 'https://basescan.org/tx/0x123...' });
}

// Example handler for swapping tokens
async function handleSwapTokens(params: ActionParams, userId: string) {
  try {
    // 1. Get wallet address from Supabase
    const chain = params.chain || 'evm';
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address, id')
      .eq('user_id', userId)
      .eq('chain', chain)
      .single();
    if (error || !wallet) {
      return { text: 'No wallet found. Create one to get started.' };
    }
    const address = wallet.address;
    // 2. Validate swap params
    const fromToken = params.fromToken;
    const toToken = params.toToken;
    const amount = params.amount;
    if (!fromToken || !toToken || !amount) {
      return { text: 'Specify fromToken, toToken, and amount.' };
    }
    if (chain === 'evm' || chain === 'base') {
      // Use 0x Swap API v2 for EVM and Base swaps
      // See: https://0x.org/docs/upgrading/upgrading_to_swap_v2
      const zeroExApiUrl = 'https://api.0x.org/swap/permit2/quote';
      const swapFeeRecipient = process.env.ZEROEX_FEE_RECIPIENT || address; // Set your fee recipient address in env
      const swapFeeBps = process.env.ZEROEX_FEE_BPS || '100'; // 100 = 1%
      const chainId = chain === 'base' ? 8453 : 1; // Base = 8453, Ethereum = 1
      const paramsObj = new URLSearchParams({
        sellToken: fromToken,
        buyToken: toToken,
        sellAmount: amount,
        taker: address,
        swapFeeBps,
        swapFeeRecipient,
        chainId: chainId.toString(),
      });
      const res = await fetch(`${zeroExApiUrl}?${paramsObj.toString()}`, {
        headers: {
          '0x-api-key': process.env.ZEROEX_API_KEY || '',
          '0x-version': 'v2',
        },
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('0x Swap v2 error:', errorText);
        return { text: 'Swap failed.' };
      }
      const data = await res.json();
      // Log transaction (no txHash yet, as 0x only provides quote)
      await supabase.from('transactions').insert([{
        user_id: userId,
        wallet_id: wallet.id,
        chain,
        tx_hash: null,
        action: 'swap',
        status: 'pending',
        metadata: { fromToken, toToken, amount, zeroExQuote: data }
      }]);
      // TODO: Implement transaction execution and status tracking
      return swapSuccess({
        from_amount: `${amount} ${fromToken}`,
        to_amount: `${data.buyAmount || 'N/A'} ${toToken}`,
        network: 'Base',
        balance: `${data.buyAmount || 'N/A'} ${toToken}`,
        explorerUrl: data.txHash ? `https://basescan.org/tx/${data.txHash}` : ''
      });
    } else if (chain === 'solana') {
      // Use Jupiter API for Solana swaps
      const jupiterApiUrl = 'https://quote-api.jup.ag/v6/quote';
      const res = await fetch(`${jupiterApiUrl}?inputMint=${fromToken}&outputMint=${toToken}&amount=${amount}&slippageBps=50`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Swap error:', errorText);
        return { text: 'Swap failed.' };
      }
      const data = await res.json();
      const route = data.data?.[0];
      // Log transaction (no txHash yet, as Jupiter only provides quote)
      await supabase.from('transactions').insert([{
        user_id: userId,
        wallet_id: wallet.id,
        chain,
        tx_hash: null,
        action: 'swap',
        status: 'pending',
        metadata: { fromToken, toToken, amount, route }
      }]);
      return swapSuccess({
        from_amount: `${amount} ${fromToken}`,
        to_amount: `${route?.outAmount || 'N/A'} ${toToken}`,
        network: 'Base',
        balance: `${route?.outAmount || 'N/A'} ${toToken}`,
        explorerUrl: route?.txid ? `https://basescan.org/tx/${route?.txid}` : ''
      });
    } else {
      return { text: 'Unsupported chain for swap.' };
    }
  } catch (error) {
    console.error('Swap error:', error);
    return { text: 'Failed to swap.' };
  }
}

async function handleGetPrice(params: ActionParams, userId: string) {
  try {
    const token = (params.token || 'ethereum').toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`);
    if (!res.ok) {
      return { text: 'Failed to fetch price.' };
    }
    const data = await res.json();
    const price = data[token]?.usd;
    if (!price) {
      return { text: `No price for ${token}` };
    }
    return { text: `${token.toUpperCase()}: $${price}` };
  } catch (error) {
    return { text: 'Failed to get price.' };
  }
}

async function handleGetNews(params: ActionParams, userId: string) {
  try {
    // You need to set your CryptoPanic API key in .env as CRYPTOPANIC_API_KEY
    const apiKey = process.env.CRYPTOPANIC_API_KEY;
    const res = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&public=true`);
    if (!res.ok) {
      return { text: 'Failed to fetch news.' };
    }
    const data = await res.json();
    const news = data.results?.slice(0, 3).map((n: any) => `• ${n.title}`).join('\n');
    return { text: news || 'No news.' };
  } catch (error) {
    return { text: 'Failed to get news.' };
  }
}

function getExplorerUrl(chain: string, txHash: string): string {
  switch (chain) {
    case 'evm':
    case 'base':
    case 'base-mainnet':
      return `https://basescan.org/tx/${txHash}`;
    case 'solana':
    case 'solana-mainnet':
      return `https://solscan.io/tx/${txHash}`;
    default:
      return '';
  }
}

// Transaction status tracking utility
async function updateTransactionStatus(txHash: string, status: string) {
  await supabase.from('transactions').update({ status }).eq('tx_hash', txHash);
}

// Multi-step send flow support
async function handleSend(params: ActionParams, userId: string) {
  try {
    // 1. Get wallet address from Supabase
    const chain = params.chain || 'evm';
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address, id')
      .eq('user_id', userId)
      .eq('chain', chain)
      .single();
    if (error || !wallet) {
      return { text: 'No wallet found. Create one to get started.' };
    }
    // 2. Multi-step: check for missing recipient or amount
    const to = params.to;
    const amount = params.amount;
    if (!to || !amount) {
      // Store pending send state in session
      const { data: session } = await supabase
        .from('sessions')
        .select('context')
        .eq('user_id', userId)
        .single();
      const context = session?.context || [];
      const pending = { ...params, action: 'send', chain };
      context.push({ role: 'system', content: JSON.stringify({ pending }) });
      await supabase.from('sessions').upsert([{ user_id: userId, context, last_active: new Date().toISOString() }], { onConflict: 'user_id' });
      if (!to && !amount) {
        return { text: 'Specify recipient and amount.' };
      } else if (!to) {
        return { text: 'Specify recipient.' };
      } else {
        return { text: 'Specify amount.' };
      }
    }
    // 3. Call CDP API to send transaction
    const cdpApiKey = process.env.CDP_API_KEY_ID;
    const cdpApiSecret = process.env.CDP_API_KEY_SECRET;
    const cdpBaseUrl = process.env.CDP_API_URL || 'https://api.developer.coinbase.com/cdp/v2';
    const fromAddress = wallet.address;
    const network = chain === 'solana' ? 'solana-mainnet' : 'base-mainnet';
    const url = `${cdpBaseUrl}/transactions/send?network=${network}`;
    const body = {
      from: fromAddress,
      to,
      amount,
      asset: params.asset || (chain === 'solana' ? 'SOL' : 'ETH'),
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'CDP-API-KEY': cdpApiKey!,
        'CDP-API-SECRET': cdpApiSecret!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Send error:', errorText);
      return { text: 'Failed to send transaction.' };
    }
    const data = await response.json();
    const txHash = data.txHash || data.transactionHash || data.hash;
    // Log transaction in Supabase
    await supabase.from('transactions').insert([{
      user_id: userId,
      wallet_id: wallet.id,
      chain,
      tx_hash: txHash,
      action: 'send',
      status: 'pending',
      metadata: { to, amount, asset: body.asset }
    }]);
    // Explorer link
    const explorerUrl = getExplorerUrl(chain, txHash);
    return transactionSuccess({ amount: amount, recipient_address: to, transaction_hash: txHash });
  } catch (error) {
    console.error('Send error:', error);
    return { text: 'Failed to send.' };
  }
}

async function handleExportKeys(params: ActionParams, userId: string) {
  // ... logic to generate privy link ...
  return privateKeys({ privy_link: 'https://privy.io/privatekeys' });
}

// Example handler for bridging
async function handleBridge(params: ActionParams, userId: string) {
  // ... logic to bridge tokens ...
  return bridgeSuccess({ amount: '50 USDC', from_network: 'Optimism', to_network: 'Base', balance: '2 USDC' });
} 