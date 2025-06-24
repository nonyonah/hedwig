import { getOrCreatePrivyWallet } from '@/lib/privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Example: Action handler interface
export type ActionParams = Record<string, any>;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function handleAction(intent: string, params: ActionParams, userId: string) {
  switch (intent) {
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
    // Add more as needed
    default:
      return { type: 'text', text: `Sorry, I don't know how to handle the action: ${intent}` };
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

    return {
      type: 'text',
      text: `✅ Your ${chain === 'solana' ? 'Solana' : 'EVM'} wallet is ready!\nAddress: ${wallet.address}`,
    };
  } catch (error) {
    return {
      type: 'text',
      text: `❌ Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
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
      return { type: 'text', text: `❌ No wallet found for user. Please create a wallet first.` };
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
      return { type: 'text', text: `❌ Failed to fetch balance from CDP.` };
    }
    const data = await response.json();
    // 3. Format balance (assume native token is first in list)
    const native = data.balances?.[0];
    const balance = native ? `${native.amount} ${native.symbol}` : '0';
    return {
      type: 'text',
      text: `💰 Your balance: ${balance}\nAddress: ${address}`,
    };
  } catch (error) {
    return {
      type: 'text',
      text: `❌ Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
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
      return { type: 'text', text: `❌ No wallet found for user. Please create a wallet first.` };
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
        return { type: 'text', text: 'Who do you want to send tokens to, and how much?' };
      } else if (!to) {
        return { type: 'text', text: 'Who do you want to send tokens to?' };
      } else {
        return { type: 'text', text: 'How much do you want to send?' };
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
      return { type: 'text', text: `❌ Failed to send transaction: ${errorText}` };
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
    return {
      type: 'text',
      text: `✅ Transaction sent!\nAmount: ${amount} ${body.asset}\nTo: ${to}\nTx Hash: ${txHash ? txHash : 'N/A'}\n${explorerUrl ? `View on Explorer: ${explorerUrl}` : ''}`,
    };
  } catch (error) {
    console.error('Send error:', error);
    return {
      type: 'text',
      text: `❌ Failed to send: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
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
      return { type: 'text', text: `❌ No wallet found for user. Please create a wallet first.` };
    }
    const address = wallet.address;
    // 2. Validate swap params
    const fromToken = params.fromToken;
    const toToken = params.toToken;
    const amount = params.amount;
    if (!fromToken || !toToken || !amount) {
      return { type: 'text', text: `❌ Please specify fromToken, toToken, and amount.` };
    }
    if (chain === 'evm') {
      // Use Uniswap API for EVM swaps
      const uniswapApiUrl = 'https://api.uniswap.org/v1/quote';
      const res = await fetch(`${uniswapApiUrl}?protocols=v3&tokenIn=${fromToken}&tokenOut=${toToken}&amount=${amount}&type=exactIn&recipient=${address}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Swap error:', errorText);
        return { type: 'text', text: `❌ Uniswap API error: ${errorText}` };
      }
      const data = await res.json();
      const quote = data.quote || data;
      const txHash = quote.txHash || quote.transactionHash || quote.hash;
      // Log transaction
      await supabase.from('transactions').insert([{
        user_id: userId,
        wallet_id: wallet.id,
        chain,
        tx_hash: txHash,
        action: 'swap',
        status: 'pending',
        metadata: { fromToken, toToken, amount }
      }]);
      const explorerUrl = txHash ? getExplorerUrl(chain, txHash) : '';
      return {
        type: 'text',
        text: `🔄 Uniswap Swap Quote:\nFrom: ${fromToken}\nTo: ${toToken}\nAmount: ${amount}\nEstimated Out: ${quote.amountOut || quote.quote || 'N/A'}\n${txHash ? `Tx Hash: ${txHash}\n` : ''}${explorerUrl ? `View on Explorer: ${explorerUrl}` : ''}\n\nTo execute this swap, sign and send the transaction data provided by Uniswap.`,
      };
    } else if (chain === 'solana') {
      // Use Jupiter API for Solana swaps
      const jupiterApiUrl = 'https://quote-api.jup.ag/v6/quote';
      const res = await fetch(`${jupiterApiUrl}?inputMint=${fromToken}&outputMint=${toToken}&amount=${amount}&slippageBps=50`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Swap error:', errorText);
        return { type: 'text', text: `❌ Jupiter API error: ${errorText}` };
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
      return {
        type: 'text',
        text: `🔄 Jupiter Swap Quote (Solana):\nFrom: ${fromToken}\nTo: ${toToken}\nAmount: ${amount}\nEstimated Out: ${route?.outAmount || 'N/A'}\n\nTo execute this swap, sign and send the transaction data provided by Jupiter.`,
      };
    } else {
      return { type: 'text', text: `❌ Unsupported chain for swap.` };
    }
  } catch (error) {
    console.error('Swap error:', error);
    return {
      type: 'text',
      text: `❌ Failed to swap: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleGetPrice(params: ActionParams, userId: string) {
  try {
    const token = (params.token || 'ethereum').toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`);
    if (!res.ok) {
      const errorText = await res.text();
      return { type: 'text', text: `❌ Failed to fetch price: ${errorText}` };
    }
    const data = await res.json();
    const price = data[token]?.usd;
    if (!price) {
      return { type: 'text', text: `❌ Could not fetch price for ${token}` };
    }
    return {
      type: 'text',
      text: `💲 ${token.charAt(0).toUpperCase() + token.slice(1)} price: $${price}`,
    };
  } catch (error) {
    return {
      type: 'text',
      text: `❌ Failed to get price: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleGetNews(params: ActionParams, userId: string) {
  try {
    // You need to set your CryptoPanic API key in .env as CRYPTOPANIC_API_KEY
    const apiKey = process.env.CRYPTOPANIC_API_KEY;
    const res = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&public=true`);
    if (!res.ok) {
      const errorText = await res.text();
      return { type: 'text', text: `❌ Failed to fetch news: ${errorText}` };
    }
    const data = await res.json();
    const news = data.results?.slice(0, 3).map((n: any) => `• ${n.title}`).join('\n');
    return {
      type: 'text',
      text: news ? `📰 Latest blockchain news:\n${news}` : '❌ Could not fetch news.',
    };
  } catch (error) {
    return {
      type: 'text',
      text: `❌ Failed to get news: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
} 