import { getOrCreatePrivyWallet } from '@/lib/privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { formatAddress } from '@/lib/utils';
import {
  walletTemplates,
  walletCreated,
  swapPending,
  swapSuccessful,
  swapFailed,
  transactionSuccess,
  confirmTransaction,
  txPending,
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
  usersWalletAddresses,
  cryptoDepositNotification,
  swapProcessing,
  swapQuoteConfirm,
  quotePending,
  swapPrompt,
  sendTokenPrompt,
  bridgeDepositNotification,
  bridgeProcessing,
  bridgeQuoteConfirm,
  bridgeQuotePending
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

  // Handle price and news requests with placeholder responses since we've commented out the actual handlers
  if (intent === 'get_price') {
    return { text: "Price information is currently unavailable. This feature will be enabled soon." };
  }
  
  if (intent === 'get_news') {
    return { text: "News updates are currently unavailable. This feature will be enabled soon." };
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
    case 'crypto_deposit_notification':
      return await handleCryptoDeposit(params, userId);
    case 'swap_processing':
      return swapProcessing();
    case 'swap_quote_confirm':
      return await handleSwapQuote(params, userId);
    case 'quote_pending':
      return quotePending();
    case 'swap_prompt':
      return await handleSwapInit(params, userId);
    case 'send_token_prompt':
      return await handleSendInit(params, userId);
    case 'tx_pending':
      return txPending();
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
      return await handleSwapProcess(params, userId);
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
    case 'bridge_deposit_notification':
      return await handleBridgeDeposit(params, userId);
    case 'bridge_processing':
      return bridgeProcessing();
    case 'bridge_quote_confirm':
      return await handleBridgeQuote(params, userId);
    case 'bridge_quote_pending':
      return bridgeQuotePending();
    case 'instruction_swap':
      return handleSwapInstructions();
    case 'instruction_bridge':
      return handleBridgeInstructions();
    case 'instruction_deposit':
      return await handleDepositInstructions(userId);
    case 'instruction_send':
      return handleSendInstructions();
    case 'crypto_received':
      return await handleCryptoReceived(params, userId);
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
  try {
    // Check if we're in the prompt phase or execution phase
    const isExecute = params.isExecute === true || params.phase === 'execute';
    
    // If not in execute phase, show the send prompt
    if (!isExecute) {
      const token = params.token || 'ETH';
      const amount = params.amount || '0.01';
      const recipient = params.recipient || params.to || formatAddress(params.address || '0x123...456');
      const network = params.network || params.chain || 'Base Sepolia';
      
      // Store the pending transaction in the session
      const { data: session } = await supabase
        .from('sessions')
        .select('context')
        .eq('user_id', userId)
        .single();
      
      const context = session?.context || [];
      const pending = { 
        action: 'send',
        token,
        amount,
        recipient,
        network
      };
      
      // Add or update the pending transaction in the context
      const existingPendingIndex = context.findIndex((item: any) => 
        item.role === 'system' && JSON.parse(item.content)?.pending?.action === 'send'
      );
      
      if (existingPendingIndex >= 0) {
        context[existingPendingIndex] = { role: 'system', content: JSON.stringify({ pending }) };
      } else {
        context.push({ role: 'system', content: JSON.stringify({ pending }) });
      }
      
      await supabase.from('sessions').upsert([{ 
        user_id: userId, 
        context, 
        last_active: new Date().toISOString() 
      }], { onConflict: 'user_id' });
      
      return handleSendInit({
        amount,
        token,
        recipient,
        network
      }, userId);
    }
    
    // If in execute phase, process the send
    // First show the pending message
    console.log('Executing send transaction with params:', params);
    
    // In a real implementation, you would call your backend service to submit the transaction
    // For now, return a placeholder success message
    return sendSuccess({ 
      amount: params.amount || '0.01', 
      token: params.token || 'ETH', 
      recipient: params.recipient || formatAddress(params.to || '0x123...456'), 
      balance: '0.05 ETH', 
      explorerUrl: 'https://sepolia.basescan.org/tx/0x123...' 
    });
  } catch (error) {
    console.error('Error sending tokens:', error);
    return sendFailed({ reason: 'Transaction failed' });
  }
}

// Example handler for swapping tokens
async function handleSwapTokens(params: ActionParams, userId: string) {
  try {
    // First, check if we're in the quote phase or execution phase
    const isQuote = params.isQuote === true || params.phase === 'quote';
    const isExecute = params.isExecute === true || params.phase === 'execute';
    
    // If no specific phase is set, start with a swap prompt
    if (!isQuote && !isExecute) {
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
      
      // 2. Validate and prepare swap parameters
      const fromToken = params.fromToken || params.from_token || 'ETH';
      const toToken = params.toToken || params.to_token || 'USDC';
      const amount = params.amount || '0.01';
      const network = params.network || chain === 'solana' ? 'Solana Devnet' : 'Base Sepolia';
      
      // 3. Show the swap prompt
      return handleSwapInit({
        from_token: fromToken,
        to_token: toToken,
        amount,
        network
      }, userId);
    }
    
    // If we're in quote phase, get a quote
    if (isQuote) {
      return handleSwapQuote(params, userId);
    }
    
    // If we're in execute phase, process the swap
    if (isExecute) {
      return handleSwapProcess(params, userId);
    }
    
    // Fallback
    return { text: 'Please specify swap details (amount, from token, to token).' };
  } catch (error) {
    console.error('Swap error:', error);
    return { text: 'Failed to swap.' };
  }
}

/*
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
*/

function getExplorerUrl(chain: string, txHash: string): string {
  switch (chain) {
    case 'evm':
    case 'base':
    case 'base-mainnet':
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case 'solana':
    case 'solana-mainnet':
      return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
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
    const network = chain === 'solana' ? 'solana-devnet' : 'base-sepolia';
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
  try {
    // Check if we're in the quote phase or execution phase
    const isQuote = params.isQuote === true || params.phase === 'quote';
    const isExecute = params.isExecute === true || params.phase === 'execute';
    
    // If no specific phase is set, get a quote
    if (!isQuote && !isExecute) {
      // Get bridge parameters
      const fromAmount = params.from_amount || params.fromAmount || params.amount || '0.01';
      const fromToken = params.from_token || params.fromToken || params.token || 'ETH';
      const fromChain = params.from_chain || params.fromChain || params.source || 'Base Sepolia';
      const toChain = params.to_chain || params.toChain || params.destination || 'Solana Devnet';
      
      // Show the bridge quote pending message
      return bridgeQuotePending();
    }
    
    // If we're in quote phase, get a quote
    if (isQuote) {
      return handleBridgeQuote(params, userId);
    }
    
    // If we're in execute phase, process the bridge
    if (isExecute) {
      return handleBridgeInit(params, userId);
    }
    
    // Fallback
    return { text: 'Please specify bridge details (amount, token, source chain, destination chain).' };
  } catch (error) {
    console.error('Bridge error:', error);
    return bridgeFailed({ reason: 'Failed to bridge tokens.' });
  }
}

// Handler for crypto deposit notification
async function handleCryptoDeposit(params: ActionParams, userId: string) {
  try {
    console.log(`Notifying user ${userId} about crypto deposit`);
    
    // Check if we have all required parameters
    const amount = params.amount || '0';
    const token = params.token || 'USDC';
    const network = params.network || 'Base Sepolia';
    
    // Get user's current balance
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', network.toLowerCase() === 'solana' ? 'solana' : 'evm')
      .single();
    
    if (error) {
      console.error('Error fetching wallet for deposit notification:', error);
    }
    
    // TODO: Implement real balance fetching from blockchain
    // For now use placeholder or provided balance
    const balance = params.balance || `${Number(amount) + 50} ${token}`;
    
    return cryptoDepositNotification({
      amount,
      token,
      network,
      balance
    });
  } catch (error) {
    console.error('Error handling crypto deposit notification:', error);
    return { text: 'Failed to process deposit notification.' };
  }
}

// Handler for swap quote
async function handleSwapQuote(params: ActionParams, userId: string) {
  try {
    console.log(`Getting swap quote for user ${userId}`);
    
    // First show pending message
    await supabase.from('messages').insert([{
      user_id: userId,
      content: JSON.stringify(quotePending()),
      role: 'assistant',
      created_at: new Date().toISOString()
    }]);
    
    // Get swap parameters
    const fromToken = params.from_token || params.fromToken || 'ETH';
    const toToken = params.to_token || params.toToken || 'USDC';
    const amount = params.amount || '0.01';
    const chain = params.chain || params.network || 'Base Sepolia';
    
    // Simulate getting a quote (in a real app, you'd call a DEX API)
    // This is a placeholder for demonstration purposes
    const fromAmount = `${amount} ${fromToken}`;
    const rate = fromToken === 'ETH' ? '2000' : fromToken === 'SOL' ? '150' : '1';
    const toAmount = `${Number(amount) * Number(rate)} ${toToken}`;
    const networkFee = chain.toLowerCase() === 'solana' ? '0.00001 SOL' : '0.0003 ETH';
    const estTime = '1-3 mins';
    
    return swapQuoteConfirm({
      from_amount: fromAmount,
      to_amount: toAmount,
      chain,
      rate: `1 ${fromToken} = $${rate}`,
      network_fee: networkFee,
      est_time: estTime
    });
  } catch (error) {
    console.error('Error getting swap quote:', error);
    return { text: 'Failed to get swap quote.' };
  }
}

// Handler for initiating a swap
async function handleSwapInit(params: ActionParams, userId: string) {
  try {
    console.log(`Initiating swap for user ${userId}`);
    
    // Get swap parameters
    const fromToken = params.from_token || params.fromToken || 'ETH';
    const toToken = params.to_token || params.toToken || 'USDC';
    const amount = params.amount || '0.01';
    const network = params.network || params.chain || 'Base Sepolia';
    
    return swapPrompt({
      amount,
      from_token: fromToken,
      to_token: toToken,
      network
    });
  } catch (error) {
    console.error('Error initiating swap:', error);
    return { text: 'Failed to initiate swap.' };
  }
}

// Handler for processing a swap
async function handleSwapProcess(params: ActionParams, userId: string) {
  try {
    console.log(`Processing swap for user ${userId}`);
    
    // First show the processing message
    await supabase.from('messages').insert([{
      user_id: userId,
      content: JSON.stringify(swapProcessing()),
      role: 'assistant',
      created_at: new Date().toISOString()
    }]);
    
    // In a real app, you would submit the swap to a DEX and wait for confirmation
    // This is a placeholder that simulates a successful swap after a delay
    
    // For demonstration, we'll return the success message directly
    // In a real app, you would set up a webhook or polling mechanism
    const fromToken = params.from_token || params.fromToken || 'ETH';
    const toToken = params.to_token || params.toToken || 'USDC';
    const amount = params.amount || '0.01';
    const network = params.network || params.chain || 'Base Sepolia';
    
    const rate = fromToken === 'ETH' ? '2000' : fromToken === 'SOL' ? '150' : '1';
    const toAmount = `${Number(amount) * Number(rate)} ${toToken}`;
    
    return swapSuccess({
      from_amount: `${amount} ${fromToken}`,
      to_amount: toAmount,
      network,
      balance: `${toAmount}`,
      explorerUrl: 'https://sepolia.basescan.org/tx/0x' // Testnet explorer URL
    });
  } catch (error) {
    console.error('Error processing swap:', error);
    return { text: 'Failed to process swap.' };
  }
}

// Handler for initiating a token send
async function handleSendInit(params: ActionParams, userId: string) {
  try {
    console.log(`Initiating send for user ${userId}`);
    
    // Get send parameters
    const token = params.token || 'ETH';
    const amount = params.amount || '0.01';
    const recipient = params.recipient || params.to || '0x...';
    const network = params.network || params.chain || 'Base Sepolia';
    
    // Return the interactive message with confirm/cancel buttons
    return sendTokenPrompt({
      amount,
      token,
      recipient,
      network
    });
  } catch (error) {
    console.error('Error initiating send:', error);
    return { text: 'Failed to initiate send.' };
  }
}

// Handler for bridge deposit notification
async function handleBridgeDeposit(params: ActionParams, userId: string) {
  try {
    console.log(`Notifying user ${userId} about bridge deposit`);
    
    // Check if we have all required parameters
    const amount = params.amount || '0';
    const token = params.token || 'ETH';
    const network = params.network || 'Base Sepolia';
    
    // Get user's current balance
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', network.toLowerCase() === 'solana' ? 'solana' : 'evm')
      .single();
    
    if (error) {
      console.error('Error fetching wallet for bridge deposit notification:', error);
    }
    
    // TODO: Implement real balance fetching from blockchain
    // For now use placeholder or provided balance
    const balance = params.balance || `${Number(amount) + 50} ${token}`;
    
    return bridgeDepositNotification({
      amount,
      token,
      network,
      balance
    });
  } catch (error) {
    console.error('Error handling bridge deposit notification:', error);
    return { text: 'Failed to process bridge deposit notification.' };
  }
}

// Handler for bridge quote
async function handleBridgeQuote(params: ActionParams, userId: string) {
  try {
    console.log(`Getting bridge quote for user ${userId}`);
    
    // First show pending message
    await supabase.from('messages').insert([{
      user_id: userId,
      content: JSON.stringify(bridgeQuotePending()),
      role: 'assistant',
      created_at: new Date().toISOString()
    }]);
    
    // Get bridge parameters
    const fromAmount = params.from_amount || params.fromAmount || '0.01 ETH';
    const toAmount = params.to_amount || params.toAmount || '0.01 ETH';
    const fromChain = params.from_chain || params.fromChain || 'Base Sepolia';
    const toChain = params.to_chain || params.toChain || 'Solana Devnet';
    const fee = params.fee || '0.0001 ETH';
    const estTime = params.est_time || params.estTime || '5-10 mins';
    
    return bridgeQuoteConfirm({
      from_amount: fromAmount,
      to_amount: toAmount,
      from_chain: fromChain,
      to_chain: toChain,
      fee,
      est_time: estTime
    });
  } catch (error) {
    console.error('Error getting bridge quote:', error);
    return { text: 'Failed to get bridge quote.' };
  }
}

// Handler for initiating a bridge
async function handleBridgeInit(params: ActionParams, userId: string) {
  try {
    console.log(`Initiating bridge for user ${userId}`);
    
    // Get bridge parameters
    const fromAmount = params.from_amount || params.fromAmount || '0.01 ETH';
    const toAmount = params.to_amount || params.toAmount || '0.01 ETH';
    const fromChain = params.from_chain || params.fromChain || 'Base Sepolia';
    const toChain = params.to_chain || params.toChain || 'Solana Devnet';
    
    // First show the bridge processing message
    await supabase.from('messages').insert([{
      user_id: userId,
      content: JSON.stringify(bridgeProcessing()),
      role: 'assistant',
      created_at: new Date().toISOString()
    }]);
    
    // In a real app, you would submit the bridge transaction and wait for confirmation
    // This is a placeholder that simulates a successful bridge after a delay
    
    // Extract the token and amount from the parameters
    const [amountValue, tokenSymbol] = fromAmount.split(' ');
    const token = tokenSymbol || 'ETH';
    
    // For demonstration, show the bridge deposit notification instead of bridge success
    // This simulates receiving tokens on the destination chain
    return bridgeDepositNotification({
      amount: amountValue,
      token: token,
      network: toChain,
      balance: toAmount
    });
  } catch (error) {
    console.error('Error initiating bridge:', error);
    return { text: 'Failed to initiate bridge.' };
  }
}

// Add a handler for crypto deposits (when tokens are received)
async function handleCryptoReceived(params: ActionParams, userId: string) {
  try {
    console.log(`Notifying user ${userId} about crypto deposit`);
    
    // Check if we have all required parameters
    const amount = params.amount || '0';
    const token = params.token || 'USDC';
    const network = params.network || 'Base Sepolia';
    
    // Get user's current balance
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', network.toLowerCase() === 'solana' ? 'solana' : 'evm')
      .single();
    
    if (error) {
      console.error('Error fetching wallet for crypto deposit notification:', error);
    }
    
    // TODO: Implement real balance fetching from blockchain
    // For now use placeholder or provided balance
    const balance = params.balance || `${Number(amount) + 50} ${token}`;
    
    // Send a crypto deposit notification
    return cryptoDepositNotification({
      amount,
      token,
      network,
      balance
    });
  } catch (error) {
    console.error('Error handling crypto deposit notification:', error);
    return { text: 'Failed to process deposit notification.' };
  }
}

// Handler for providing swap instructions
function handleSwapInstructions() {
  return {
    text: `💱 *How to Swap Tokens*\n\nTo swap tokens, simply type a message like:\n\n"Swap 0.001 SOL to USDC on Solana"\n\nor\n\n"Swap 0.01 ETH to USDC on Base"\n\nI'll then search for the best quote and show you the details for confirmation.`
  };
}

// Handler for providing bridge instructions
function handleBridgeInstructions() {
  return {
    text: `🌉 *How to Bridge Tokens*\n\nTo bridge tokens between chains, simply type a message like:\n\n"Bridge 0.001 SOL on Solana to ETH on Base"\n\nor\n\n"Bridge 0.01 ETH on Base to Solana"\n\nI'll then search for the best route and show you the details for confirmation.`
  };
}

// Handler for providing deposit instructions
async function handleDepositInstructions(userId: string) {
  try {
    // Get wallet addresses to show the user where to deposit
    const { data: evmWallet, error: evmError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'evm')
      .single();
      
    if (evmError) {
      console.error('Error fetching EVM wallet:', evmError);
    }
    
    const { data: solanaWallet, error: solanaError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'solana')
      .single();
      
    if (solanaError) {
      console.error('Error fetching Solana wallet:', solanaError);
    }
    
    // If the user doesn't have wallets yet, prompt them to create wallets
    if ((!evmWallet || !solanaWallet) && (!evmWallet?.address && !solanaWallet?.address)) {
      return {
        text: `💼 *Deposit Instructions*\n\nBefore you can deposit funds, you need to create a wallet first. Type "create wallet" to get started.`
      };
    }
    
    // Return wallet addresses as deposit instructions
    return {
      text: `📥 *How to Deposit Funds*\n\nYou can deposit funds to your wallets using these addresses:\n\n*EVM Wallet (Base, Ethereum):*\n\`${evmWallet?.address || 'Not created yet'}\`\n\n*Solana Wallet:*\n\`${solanaWallet?.address || 'Not created yet'}\`\n\nOnce your deposit is confirmed on the blockchain, I'll send you a notification.`
    };
  } catch (error) {
    console.error('Error in handleDepositInstructions:', error);
    return { text: 'Failed to get deposit instructions. Please try again.' };
  }
}

// Handler for providing send/withdraw instructions
function handleSendInstructions() {
  return {
    text: `📤 *How to Send or Withdraw Tokens*\n\nTo send tokens to another wallet, simply type a message like:\n\n"Send 0.001 ETH to 0x1234...5678 on Base"\n\nor\n\n"Send 0.1 SOL to address 8rUW...ZjqP on Solana"\n\nI'll then show you a confirmation with the details before proceeding.`
  };
} 