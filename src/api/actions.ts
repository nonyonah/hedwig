import { getOrCreatePrivyWallet, getPrivyAuthHeader } from '@/lib/privy';
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
  txSentSuccess,
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
import { PrivyClient } from '@privy-io/server-auth';
import crypto from 'crypto';
import { sendWhatsAppTemplate } from '@/lib/whatsappUtils';
import type { NextApiRequest, NextApiResponse } from 'next';

// Example: Action handler interface
export type ActionParams = Record<string, any>;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const privyClient = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

const appId = process.env.PRIVY_APP_ID!;
const appSecret = process.env.PRIVY_APP_SECRET!;

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
  console.log('[handleAction] Intent:', intent, 'Params:', params, 'UserId:', userId);
  
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
      return await handleCryptoDeposit({
        ...params,
        from: params.from || '-',
        txUrl: params.txUrl || '-'
      }, userId);
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
      return sendSuccessSanitized({
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
    console.log(`Getting wallet address for user ${userId}`);
    
    // Get EVM wallet
    const { data: evmWallet, error: evmError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'evm')
      .single();
      
    if (evmError) {
      console.error('Error fetching EVM wallet:', evmError);
      return { text: 'Your wallets have not been created yet. Type "create wallet" to get started.' };
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
      return { text: 'Your wallets have not been created yet. Type "create wallet" to get started.' };
    }

    // Format addresses for better readability
    const evmAddress = evmWallet?.address || '';
    const solanaAddress = solanaWallet?.address || '';
    
    const formatAddress = (address: string) => {
      if (!address) return 'Not available';
      if (address.length <= 12) return address;
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };
    
    // Create formatted versions for display
    const formattedEvmAddress = formatAddress(evmAddress);
    const formattedSolanaAddress = formatAddress(solanaAddress);
    
    // Create explorer links
    const evmExplorerLink = `https://sepolia.basescan.org/address/${evmAddress}`;
    const solanaExplorerLink = `https://explorer.solana.com/address/${solanaAddress}?cluster=devnet`;
    
    // Return the users_wallet_addresses template with full addresses
    // The template will display the formatted versions but contain the full addresses for copying
    return usersWalletAddresses({
      evm_wallet: `${formattedEvmAddress} (${evmExplorerLink})`,
      solana_wallet: `${formattedSolanaAddress} (${solanaExplorerLink})`
    });
  } catch (error) {
    console.error('Error in handleGetWalletAddress:', error);
    return { text: 'Failed to retrieve wallet addresses.' };
  }
}

// Helper to fetch ETH balance on Base Sepolia via Alchemy RPC
async function getBaseSepoliaEthBalance(address: string): Promise<string> {
  const rpcUrl = 'https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up';
  const body = {
    jsonrpc: '2.0',
    method: 'eth_getBalance',
    params: [address, 'latest'],
    id: 1
  };
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  return data.result ? (parseInt(data.result, 16) / 1e18).toString() : '0';
}

// Helper to fetch USDC (ERC-20) balance on Base Sepolia
async function getBaseSepoliaUsdcBalance(address: string): Promise<string> {
  try {
    const rpcUrl = 'https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up';
    const USDC_CONTRACT = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607';
    const balanceOfData = '0x70a08231000000000000000000000000' + address.replace('0x', '');
    const body = {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{
        to: USDC_CONTRACT,
        data: balanceOfData
      }, 'latest'],
      id: 1
    };
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    
    if (!data.result) {
      console.log('[DEBUG] No result from USDC balance call:', data);
      return '0';
    }
    
    // Parse the hex value safely
    const balanceHex = data.result;
    const balanceInt = parseInt(balanceHex, 16);
    
    // Check for NaN and handle it
    if (isNaN(balanceInt)) {
      console.error('[ERROR] Failed to parse USDC balance hex:', balanceHex);
      return '0';
    }
    
    const balance = (balanceInt / 1e6).toString();
    console.log('[DEBUG] USDC balance for', address, ':', balance);
    return balance;
  } catch (error) {
    console.error('[ERROR] Exception in getBaseSepoliaUsdcBalance:', error);
    return '0';
  }
}

// Helper to fetch SOL balance via Solana Devnet RPC
async function getSolanaSolBalanceDirect(address: string): Promise<string> {
  const rpcUrl = 'https://api.devnet.solana.com';
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [address]
  };
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  return data.result && data.result.value ? (data.result.value / 1e9).toString() : '0';
}

// Helper to fetch SPL token balances for a Solana address using Moralis Web3 Data API (Devnet)
async function getSolanaSplTokenBalancesMoralis(address: string): Promise<any[]> {
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) throw new Error('MORALIS_API_KEY is not set');
  const url = `https://solana-gateway.moralis.io/account/devnet/${address}/tokens?excludeSpam=true`;
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'X-API-Key': apiKey
  };
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    console.error('Moralis SPL token balance error:', await resp.text());
    return [];
  }
  const data = await resp.json();
  return data.tokens || [];
}

// Helper to fetch USDC SPL balance on Solana using Moralis
async function getSolanaUsdcBalance(address: string): Promise<string> {
  // USDC mint on Solana Devnet
  const USDC_MINT = '7XS5uQ6rQwBEmPA6k6RdtqvYXvyfZ87XZy4r2k6F6Z7F';
  const tokens = await getSolanaSplTokenBalancesMoralis(address);
  const usdc = tokens.find((t: any) => t.mint === USDC_MINT);
  return usdc ? (Number(usdc.amount) / 1e6).toString() : '0';
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
    const evmAddress = evmWallet?.address;
    const solanaAddress = solanaWallet?.address;
    // Fetch balances
    let eth = '0', usdcBase = '0', sol = '0', usdcSolana = '0';
    if (evmAddress) {
      eth = await getBaseSepoliaEthBalance(evmAddress);
      usdcBase = await getBaseSepoliaUsdcBalance(evmAddress);
    }
    if (solanaAddress) {
      console.log('[DEBUG] Solana address for user:', solanaAddress);
      sol = await getSolanaSolBalanceDirect(solanaAddress);
      usdcSolana = await getSolanaUsdcBalance(solanaAddress);
    } else {
      console.error('[ERROR] No Solana address found for user:', userId);
    }
    // Compare with last known balances
    const { data: session } = await supabase
      .from('sessions')
      .select('context')
      .eq('user_id', userId)
      .single();
    let last = null;
    if (session?.context) {
      last = session.context.find((item: any) => item.role === 'system' && JSON.parse(item.content)?.lastBalances);
    }
    let lastBalances = last ? JSON.parse(last.content).lastBalances : {};
    // If any balance changed, trigger deposit notification
    const changed =
      eth !== (lastBalances.eth || '0') ||
      sol !== (lastBalances.sol || '0');
    if (changed) {
      // Send deposit notification (for both up and down)
      if (parseFloat(eth) !== parseFloat(lastBalances.eth || '0')) {
        await handleAction('crypto_deposit_notification', {
          amount: eth,
          token: 'ETH',
          network: 'Base Sepolia',
          balance: eth
        }, userId);
      }
      if (parseFloat(sol) !== parseFloat(lastBalances.sol || '0')) {
        await handleAction('crypto_deposit_notification', {
          amount: sol,
          token: 'SOL',
          network: 'Solana Devnet',
          balance: sol
        }, userId);
      }
    }
    // Store new balances in session
    await supabase.from('sessions').upsert([
      {
        user_id: userId,
        context: [{
          role: 'system',
          content: JSON.stringify({ lastBalances: { eth, sol } })
        }],
        updated_at: new Date().toISOString()
      }
    ], { onConflict: 'user_id' });
    // Return balances with live data (numeric only)
    return walletBalance({
      eth_balance: eth,
      usdc_base_balance: usdcBase,
      sol_balance: sol,
      usdc_solana_balance: usdcSolana
    });
  } catch (error) {
    console.error('Error in handleGetWalletBalance:', error);
    return { text: 'Failed to get wallet balance.' };
  }
}

// Example handler for sending tokens
async function handleSendTokens(params: ActionParams, userId: string) {
  try {
    const isExecute = params.isExecute === true || params.phase === 'execute';
    const token = params.token;
    const amount = params.amount;
    const recipient = params.recipient || params.to;
    const network = params.network || params.chain;

    console.log('[DEBUG] handleSendTokens params:', { token, amount, recipient, network });

    // If any required parameter is missing, prompt and store pending context
    const missing: string[] = [];
    if (!token) missing.push('token');
    if (!amount) missing.push('amount');
    if (!recipient) missing.push('recipient');
    if (!network) missing.push('network');

    // Check if network contains "solana" case-insensitively
    const isSolana = network && typeof network === 'string' && network.toLowerCase().includes('solana');
    console.log('[DEBUG] Network check - isSolana:', isSolana, 'Original network value:', network);

    if (missing.length > 0) {
      let promptText = 'To send tokens, please specify: ';
      if (missing.length === 4) {
        promptText = 'What token do you want to send, how much, to which address, and on which chain?';
      } else {
        promptText += missing.join(', ');
      }
      // Store pending context in session
      await supabase.from('sessions').upsert([
        {
          user_id: userId,
          context: [{
            role: 'system',
            content: JSON.stringify({ pending: { action: 'send', ...params } })
          }],
          updated_at: new Date().toISOString()
        }
      ], { onConflict: 'user_id' });
      return { text: promptText };
    }

    // If in execution phase, process the send
    if (isExecute) {
      // Get sender wallet address and privy_wallet_id from DB
      let senderAddress = '';
      let privyWalletId = '';
      let chain: 'evm' | 'solana' = 'evm';
      if (network.toLowerCase().includes('solana')) {
        chain = 'solana';
        console.log('[DEBUG] Using Solana chain for send transaction');
        const { data: solanaWallet } = await supabase
          .from('wallets')
          .select('address, privy_wallet_id')
          .eq('user_id', userId)
          .eq('chain', 'solana')
          .single();
        senderAddress = solanaWallet?.address;
        privyWalletId = solanaWallet?.privy_wallet_id;
        console.log('[DEBUG] Solana wallet found:', { senderAddress, privyWalletId });
      } else {
        chain = 'evm';
        console.log('[DEBUG] Using EVM chain for send transaction');
        const { data: evmWallet } = await supabase
          .from('wallets')
          .select('address, privy_wallet_id')
          .eq('user_id', userId)
          .eq('chain', 'evm')
          .single();
        senderAddress = evmWallet?.address;
        privyWalletId = evmWallet?.privy_wallet_id;
        console.log('[DEBUG] EVM wallet found:', { senderAddress, privyWalletId });
      }
      if (!senderAddress || !privyWalletId) {
        return sendFailed({ reason: 'Sender wallet not found.' });
      }
      let txHash = '';
      let explorerUrl = '';
      try {
        // Privy API call
        const privyApiUrl = 'https://api.privy.io/v1/wallets';
        const privyAppId = process.env.PRIVY_APP_ID!;
        const privyAppSecret = process.env.PRIVY_APP_SECRET!;
        const rpcUrl = `${privyApiUrl}/${privyWalletId}/rpc`;
        let method, body;
        if (chain === 'solana') {
          // For Solana, use solana_sendTransaction per Privy docs
          // Convert amount to lamports (1 SOL = 1e9 lamports)
          const amountLamports = Math.floor(Number(amount) * 1e9).toString();
          method = 'solana_sendTransaction';
          
          // Create a base64-encoded transaction
          // Note: In a real implementation, we would construct a proper Solana transaction
          // For now, we're using a placeholder structure that matches Privy's expected format
          const dummyTx = {
            to: recipient,
            amount: amountLamports
          };
          
          // Convert to base64 string (simulating a real encoded transaction)
          const base64Tx = Buffer.from(JSON.stringify(dummyTx)).toString('base64');
          
          body = JSON.stringify({
            method,
            params: {
              transaction: base64Tx,
              encoding: "base64"
            }
          });
          
          // Calculate SOL fee for display in template
          const solFee = 0.000005; // Typical SOL fee
          params.fee = `${solFee.toFixed(6)} SOL`;
          
          console.log('[DEBUG] Solana transaction payload:', body);
        } else {
          // For EVM chains, use the format from Privy docs for Ethereum
          const amountValue = Number(amount);
          const adjustedAmount = amountValue * 0.95; // Reduce by 5% to leave room for gas fees
          const amountInWei = Math.floor(adjustedAmount * 1e18); // Convert ETH to wei
          const amountInHex = '0x' + amountInWei.toString(16);
          method = 'eth_sendTransaction';
          body = JSON.stringify({
            method,
            caip2: 'eip155:84532', // Base Sepolia chain ID
            chain_type: 'ethereum',
            params: {
              transaction: {
                to: recipient,
                value: amountInHex,
                from: senderAddress
              }
            }
          });
          // Calculate gas fee for display in template only
          const gasFeeWei = 21000 * 5000000000; // gas units * gas price in wei
          const gasFeeEth = gasFeeWei / 1e18; // Convert to ETH
          params.fee = `${gasFeeEth.toFixed(6)} ETH`;
        }
        // Prepare auth headers
        const auth = Buffer.from(`${privyAppId}:${privyAppSecret}`).toString('base64');
        const headers = {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'privy-app-id': privyAppId
        };
        // Extra logging
        console.log('[Privy RPC] URL:', rpcUrl);
        console.log('[Privy RPC] Headers:', headers);
        console.log('[Privy RPC] Body:', body);
        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers,
          body
        });
        const rpcResText = await rpcRes.text();
        console.log('[Privy RPC] Response status:', rpcRes.status);
        console.log('[Privy RPC] Response body:', rpcResText);
        if (!rpcRes.ok) {
          console.log('[Privy RPC] Transaction failed');
          return sendFailed({ reason: `Transaction failed: ${rpcResText}` });
        }
        console.log('[Privy RPC] Transaction successful!');
        const rpcResult = JSON.parse(rpcResText);
        txHash = rpcResult.data?.hash || rpcResult.data?.transaction_hash || rpcResult.data || '';
        explorerUrl = chain === 'solana'
          ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
          : `https://sepolia.basescan.org/tx/${txHash}`;
        // Fetch new balance for template
        let newBalance = '0';
        if (chain === 'evm') {
          newBalance = await getBaseSepoliaEthBalance(senderAddress);
        } else if (chain === 'solana') {
          newBalance = await getSolanaSolBalanceDirect(senderAddress);
        }
        // Format values for the template
        const formattedBalance = `${newBalance} ${token}`;
        const formattedRecipient = recipient.length > 15 
          ? `${recipient.substring(0, 6)}...${recipient.substring(recipient.length - 4)}`
          : recipient;
        console.log('[Transaction] Preparing success template with:', {
          amount,
          token,
          recipient: formattedRecipient,
          balance: formattedBalance,
          explorerUrl
        });
        // Return the success template with all required parameters
        return txSentSuccess({
          amount,
          token,
          recipient: formattedRecipient,
          explorerUrl
        });
      } catch (err: any) {
        console.error('Send transaction error:', err);
        return sendFailed({ reason: err?.message || 'Transaction failed.' });
      }
    }

    // If all details are present, clear pending context
    await supabase.from('sessions').upsert([
      {
        user_id: userId,
        context: [],
        updated_at: new Date().toISOString()
      }
    ], { onConflict: 'user_id' });

    // Prompt for confirmation (not execution yet)
    const fee = params.fee || (token === 'SOL' ? '0.000005 SOL' : '0.0001 ETH');
    const estimatedTime = params.estimatedTime || '1-5 mins';
    return sendTokenPrompt({ amount, token, recipient, network, fee, estimatedTime });
  } catch (error) {
    console.error('Send error:', error);
    return sendFailed({ reason: 'Failed to send.' });
  }
}

// Example handler for swapping tokens
async function handleSwapTokens(params: ActionParams, userId: string) {
  try {
    const isQuote = params.isQuote === true || params.phase === 'quote';
    const isExecute = params.isExecute === true || params.phase === 'execute';
    const fromToken = params.from_token || params.fromToken;
    const toToken = params.to_token || params.toToken;
    const amount = params.amount;

    // If any required parameter is missing, prompt and store pending context
    if (!fromToken || !toToken || !amount) {
      let prompt = 'To swap tokens, please specify:';
      if (!amount && !fromToken && !toToken) {
        prompt = 'What token do you want to swap, how much, and to which token?';
      } else if (!amount) {
        prompt = `How much ${fromToken || ''} do you want to swap to ${toToken || ''}?`;
      } else if (!fromToken) {
        prompt = `Which token do you want to swap from? (e.g. ETH, SOL)`;
      } else if (!toToken) {
        prompt = `Which token do you want to swap to? (e.g. USDC, ETH)`;
      }
      // Store pending context in session
      await supabase.from('sessions').upsert([
        {
          user_id: userId,
          context: [{
            role: 'system',
            content: JSON.stringify({ pending: { action: 'swap', ...params } })
          }],
          updated_at: new Date().toISOString()
        }
      ], { onConflict: 'user_id' });
      return { text: prompt };
    }

    // If all details are present, clear pending context
    await supabase.from('sessions').upsert([
      {
        user_id: userId,
        context: [],
        updated_at: new Date().toISOString()
      }
    ], { onConflict: 'user_id' });

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
      // 2. Show the swap prompt
      const network = params.network || chain === 'solana' ? 'Solana Devnet' : 'Base Sepolia';
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
    const cdpBaseUrl = process.env.CDP_API_URL || 'https://api.cdp.coinbase.com/v2';
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
    const isQuote = params.isQuote === true || params.phase === 'quote';
    const isExecute = params.isExecute === true || params.phase === 'execute';
    const amount = params.from_amount || params.amount;
    const token = params.from_token || params.token;
    const fromChain = params.from_chain || params.fromChain || params.source;
    const toChain = params.to_chain || params.toChain || params.destination;

    // If any required parameter is missing, prompt and store pending context
    if (!amount || !token || !fromChain || !toChain) {
      let prompt = 'To bridge tokens, please specify:';
      if (!amount && !token && !fromChain && !toChain) {
        prompt = 'Which token and chain do you want to bridge from, and to which chain?';
      } else if (!amount) {
        prompt = `How much ${token || ''} do you want to bridge from ${fromChain || ''} to ${toChain || ''}?`;
      } else if (!token) {
        prompt = `Which token do you want to bridge? (e.g. ETH, SOL)`;
      } else if (!fromChain) {
        prompt = `Which chain do you want to bridge from? (e.g. Base, Solana)`;
      } else if (!toChain) {
        prompt = `Which chain do you want to bridge to? (e.g. Base, Solana)`;
      }
      // Store pending context in session
      await supabase.from('sessions').upsert([
        {
          user_id: userId,
          context: [{
            role: 'system',
            content: JSON.stringify({ pending: { action: 'bridge', ...params } })
          }],
          updated_at: new Date().toISOString()
        }
      ], { onConflict: 'user_id' });
      return { text: prompt };
    }

    // If all details are present, clear pending context
    await supabase.from('sessions').upsert([
      {
        user_id: userId,
        context: [],
        updated_at: new Date().toISOString()
      }
    ], { onConflict: 'user_id' });

    // If no specific phase is set, get a quote
    if (!isQuote && !isExecute) {
      // Get bridge parameters
      const fromAmount = amount;
      const fromToken = token;
      // 2. Show the bridge quote pending message
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
    const from = params.from || '-';
    const txUrl = params.txUrl || '-';
    
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
      from,
      network,
      balance,
      txUrl
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
    const fee = params.fee || (token === 'SOL' ? '0.000005 SOL' : '0.0001 ETH');
    const estimatedTime = params.estimatedTime || '1-5 mins';
    // Return the interactive message with confirm/cancel buttons
    return sendTokenPrompt({
      amount,
      token,
      recipient,
      network,
      fee,
      estimatedTime
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
    const from = params.from || '-';
    const txUrl = params.txUrl || '-';
    
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
      from,
      network,
      balance,
      txUrl
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

// Helper to sanitize WhatsApp template parameters
function sanitizeWhatsAppParam(text: string): string {
  return text
    .replace(/[\n\t]/g, ' ')
    .replace(/ {5,}/g, '    ');
}

// Patch sendSuccess, sendFailed, sendTokenPrompt, etc. to sanitize parameters before sending
// Example for sendSuccess:
function sendSuccessSanitized(args: any) {
  return txSentSuccess({
    ...args,
    amount: sanitizeWhatsAppParam(args.amount),
    token: sanitizeWhatsAppParam(args.token),
    recipient: sanitizeWhatsAppParam(args.recipient),
    explorerUrl: sanitizeWhatsAppParam(args.explorerUrl)
  });
}

function cdpSign({ secret, timestamp, method, requestPath, body }: { secret: string, timestamp: string, method: string, requestPath: string, body: string }): string {
  const prehash = timestamp + method.toUpperCase() + requestPath + body;
  return crypto.createHmac('sha256', secret).update(prehash).digest('hex');
}

// --- Alchemy Webhook Handler for Deposit Notifications ---
// This should be added to your API routes (e.g., /api/webhooks/alchemy)
export async function handleAlchemyWebhook(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('[Alchemy Webhook] Handler called:', JSON.stringify(req.body, null, 2));
    const event = req.body;
    const activities = event.event?.activity || [];
    console.log('[Alchemy Webhook] Activities:', activities);
    for (const activity of activities) {
      if ((activity.category === 'token_transfer' || activity.category === 'external') && activity.toAddress) {
        const toAddress = activity.toAddress.toLowerCase();
        console.log('[Alchemy Webhook] Looking up wallet for address:', toAddress);
        const { data: wallet } = await supabase
          .from('wallets')
          .select('user_id, chain, privy_wallet_id')
          .eq('address', toAddress)
          .single();
        console.log('[Alchemy Webhook] Wallet lookup result:', wallet);
        if (!wallet) {
          const { data: allWallets } = await supabase.from('wallets').select('address');
          console.log('[Alchemy Webhook] No wallet found. All wallet addresses in DB:', allWallets);
          continue;
        }
        const { data: user } = await supabase
          .from('users')
          .select('phone_number')
          .eq('id', wallet.user_id)
          .single();
        console.log('[Alchemy Webhook] User lookup result:', user);
        if (!user) {
          console.log('[Alchemy Webhook] No user found for wallet:', toAddress);
          continue;
        }
        const amount = activity.value ? Number(activity.value).toFixed(6) : '0';
        const token = activity.asset || 'ETH';
        const from = activity.fromAddress || '-';
        const network = wallet.chain === 'solana' ? 'Solana Devnet' : 'Base Sepolia';
        let balance = amount + ' ' + token;
        let newBalance = '0';
        let lastBalance = '0';
        if (wallet.chain === 'evm') {
          newBalance = await getBaseSepoliaEthBalance(toAddress);
          balance = newBalance + ' ' + token;
        } else if (wallet.chain === 'solana') {
          newBalance = await getSolanaSolBalanceDirect(toAddress);
          balance = newBalance + ' ' + token;
        }
        // Fetch last known balance from sessions
        const { data: session } = await supabase
          .from('sessions')
          .select('context')
          .eq('user_id', wallet.user_id)
          .single();
        let last = null;
        if (session?.context) {
          last = session.context.find((item: any) => item.role === 'system' && JSON.parse(item.content)?.lastBalances);
        }
        let lastBalances = last ? JSON.parse(last.content).lastBalances : {};
        if (wallet.chain === 'evm') {
          lastBalance = lastBalances.eth || '0';
        } else if (wallet.chain === 'solana') {
          lastBalance = lastBalances.sol || '0';
        }
        console.log('[Alchemy Webhook] New balance:', newBalance, 'Previous:', lastBalance);
        // Only send template if balance changed
        if (newBalance !== lastBalance) {
          const txHash = activity.hash || '';
          const txUrl = txHash
            ? (wallet.chain === 'solana'
                ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
                : `https://basescan.org/tx/${txHash}`)
            : '-';
          const templateParams = { amount, token, from, network, balance, txUrl };
          console.log('[Alchemy Webhook] Sending WhatsApp template:', {
            phone: user.phone_number,
            params: templateParams
          });
          try {
            const result = await sendWhatsAppTemplate(user.phone_number, cryptoDepositNotification(templateParams));
            console.log('[Alchemy Webhook] WhatsApp API result:', result);
          } catch (err) {
            console.error('[Alchemy Webhook] WhatsApp send error:', err);
          }
          console.log(`[Alchemy Webhook] Notified user ${user.phone_number} of deposit to ${toAddress}`);
        } else {
          console.log('[Alchemy Webhook] Balance unchanged, not sending template.');
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Alchemy Webhook] Error:', err);
    res.status(500).json({ error: 'Webhook handler error' });
  }
}
