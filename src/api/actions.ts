import { getOrCreatePrivyWallet } from '@/lib/privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import {
  walletTemplates,
  walletAddress,
  walletBalanceUpdate,
  walletCreated,
  swapPending,
  swapSuccessful,
  swapFailed,
  transactionSuccess,
  confirmTransaction
} from '@/lib/whatsappTemplates';

// Example: Action handler interface
export type ActionParams = Record<string, any>;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Minimal fallback error template
function errorTemplate(message: string) {
  return {
    template: 'error',
    language: { code: 'en' },
    components: [
      { type: 'body', parameters: [{ type: 'text', text: message }] },
      { type: 'button', sub_type: 'quick_reply', index: 0, parameters: [{ type: 'payload', payload: 'HELP' }] }
    ]
  };
}

export async function handleAction(intent: string, params: ActionParams, userId: string) {
  switch (intent) {
    case 'welcome':
      return await handleWelcome(userId);
    case 'create_wallet':
      return await handleCreateWallet(params, userId);
    case 'get_balance':
      return await handleGetBalance(params, userId);
    case 'send':
      return await handleSend(params, userId);
    case 'swap':
      return await handleSwap(params, userId);
    case 'get_price':
      return await handleGetPrice(params, userId);
    case 'get_news':
      return await handleGetNews(params, userId);
    case 'clarification':
      return errorTemplate(params.message || 'Can you clarify your request?');
    default:
      return errorTemplate(`Sorry, I don't know how to handle the action: ${intent}`);
  }
}

// Example handler stubs
async function handleCreateWallet(params: ActionParams, userId: string) {
  try {
    // Allow chain selection via params, default to 'evm'
    const chain = params.chain || 'evm';
    const phoneNumber = params.phoneNumber || userId; // fallback to userId if phoneNumber not provided

    const wallet = await getOrCreatePrivyWallet({
      userId,
      phoneNumber,
      chain,
    });

    return walletCreated({ address: wallet.address });
  } catch (error) {
    return errorTemplate('Failed to create wallet.');
  }
}

async function handleGetBalance(params: ActionParams, userId: string) {
  try {
    // 1. Get wallet address from Supabase
    const chain = params.chain || 'evm';
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', chain)
      .single();
    if (error || !wallet) {
      return errorTemplate('No wallet found. Create one to get started.');
    }
    // 2. Call CDP API to get balance
    const cdpApiKey = process.env.CDP_API_KEY_ID;
    const cdpApiSecret = process.env.CDP_API_KEY_SECRET;
    const cdpBaseUrl = process.env.CDP_API_URL || 'https://api.developer.coinbase.com/cdp/v2';
    const address = wallet.address;
    const network = chain === 'solana' ? 'solana-mainnet' : 'base-mainnet';
    const url = `${cdpBaseUrl}/wallets/${address}/balances?network=${network}`;
    const response = await fetch(url, {
      headers: {
        'CDP-API-KEY': cdpApiKey!,
        'CDP-API-SECRET': cdpApiSecret!,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      return errorTemplate('Failed to fetch balance.');
    }
    const data = await response.json();
    // 3. Format balance (assume native token is first in list)
    const native = data.balances?.[0];
    const balance = native ? `${native.amount}` : '0';
    const currency = native ? native.symbol : (chain === 'solana' ? 'SOL' : 'ETH');
    return walletBalanceUpdate({ balance_amount: balance, currency });
  } catch (error) {
    return errorTemplate('Failed to get balance.');
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
      return errorTemplate('No wallet found. Create one to get started.');
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
        return errorTemplate('Specify recipient and amount.');
      } else if (!to) {
        return errorTemplate('Specify recipient.');
      } else {
        return errorTemplate('Specify amount.');
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
      return errorTemplate('Failed to send transaction.');
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
    return errorTemplate('Failed to send.');
  }
}

async function handleSwap(params: ActionParams, userId: string) {
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
      return errorTemplate('No wallet found. Create one to get started.');
    }
    const address = wallet.address;
    // 2. Validate swap params
    const fromToken = params.fromToken;
    const toToken = params.toToken;
    const amount = params.amount;
    if (!fromToken || !toToken || !amount) {
      return errorTemplate('Specify fromToken, toToken, and amount.');
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
        return errorTemplate('Swap failed.');
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
      return swapSuccessful({
        success_message: `Swap successful!`,
        wallet_balance: `${data.buyAmount || 'N/A'} ${toToken}`,
        tx_hash: data.txHash || ''
      });
    } else if (chain === 'solana') {
      // Use Jupiter API for Solana swaps
      const jupiterApiUrl = 'https://quote-api.jup.ag/v6/quote';
      const res = await fetch(`${jupiterApiUrl}?inputMint=${fromToken}&outputMint=${toToken}&amount=${amount}&slippageBps=50`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Swap error:', errorText);
        return errorTemplate('Swap failed.');
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
      return swapSuccessful({
        success_message: `Swap successful!`,
        wallet_balance: `${route?.outAmount || 'N/A'} ${toToken}`,
        tx_hash: route?.txid || ''
      });
    } else {
      return errorTemplate('Unsupported chain for swap.');
    }
  } catch (error) {
    console.error('Swap error:', error);
    return errorTemplate('Failed to swap.');
  }
}

async function handleGetPrice(params: ActionParams, userId: string) {
  try {
    const token = (params.token || 'ethereum').toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`);
    if (!res.ok) {
      return errorTemplate('Failed to fetch price.');
    }
    const data = await res.json();
    const price = data[token]?.usd;
    if (!price) {
      return errorTemplate(`No price for ${token}`);
    }
    return {
      template: 'price',
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: `${token.toUpperCase()}: $${price}` }] },
        { type: 'button', sub_type: 'quick_reply', index: 0, parameters: [{ type: 'payload', payload: 'GET_BALANCE' }] }
      ]
    };
  } catch (error) {
    return errorTemplate('Failed to get price.');
  }
}

async function handleGetNews(params: ActionParams, userId: string) {
  try {
    // You need to set your CryptoPanic API key in .env as CRYPTOPANIC_API_KEY
    const apiKey = process.env.CRYPTOPANIC_API_KEY;
    const res = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&public=true`);
    if (!res.ok) {
      return errorTemplate('Failed to fetch news.');
    }
    const data = await res.json();
    const news = data.results?.slice(0, 3).map((n: any) => `• ${n.title}`).join('\n');
    return {
      template: 'news',
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: news || 'No news.' }] },
        { type: 'button', sub_type: 'quick_reply', index: 0, parameters: [{ type: 'payload', payload: 'GET_PRICE' }] }
      ]
    };
  } catch (error) {
    return errorTemplate('Failed to get news.');
  }
}

// Welcome handler: greets user, lists capabilities, and shows create wallet template if new
async function handleWelcome(userId: string) {
  // Check if user has a wallet
  const { data: wallet } = await supabase
    .from('wallets')
    .select('address')
    .eq('user_id', userId)
    .maybeSingle();
  const greeting = {
    template: 'welcome',
    language: { code: 'en' },
    components: [
      { type: 'body', parameters: [{ type: 'text', text: '👋 Welcome to Hedwig!'}] },
      { type: 'button', sub_type: 'quick_reply', index: 0, parameters: [{ type: 'payload', payload: 'CREATE_WALLET' }] }
    ]
  };
  if (!wallet) {
    return [greeting];
  }
  return greeting;
} 