import { formatAddress } from './utils';

// Basic text template function
export function textTemplate(text: string) {
  return { text };
}

/**
 * Template: tx_pending
 * Parameter Format: POSITIONAL
 * No parameters needed
 */
export function txPending() {
  return {
    name: 'tx_pending',
    language: 'en',
    components: [
      {
        type: 'BODY'
      }
    ]
  };
}

/**
 * Template: bridge_deposit_notification
 * Parameter Format: POSITIONAL
 * Parameters: amount, token, network, balance
 */
export function bridgeDepositNotification({ amount, token, network, balance }: { amount: string, token: string, network: string, balance: string }) {
  return {
    name: 'bridge_deposit_notification',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: amount },
          { type: 'text', text: token },
          { type: 'text', text: network },
          { type: 'text', text: balance }
        ]
      }
    ]
  };
}

/**
 * Template: bridge_processing
 * Parameter Format: POSITIONAL
 * No parameters needed
 */
export function bridgeProcessing() {
  return {
    name: 'bridge_processing',
    language: 'en',
    components: [
      {
        type: 'BODY'
      }
    ]
  };
}

/**
 * Template: bridge_quote_confirm
 * Parameter Format: POSITIONAL
 * Parameters: from_amount, to_amount, from_chain, to_chain, fee, est_time
 */
export function bridgeQuoteConfirm({ 
  from_amount, 
  to_amount, 
  from_chain, 
  to_chain, 
  fee, 
  est_time 
}: { 
  from_amount: string, 
  to_amount: string, 
  from_chain: string, 
  to_chain: string, 
  fee: string, 
  est_time: string 
}) {
  return {
    name: 'bridge_quote_confirm',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: from_amount },
          { type: 'text', text: to_amount },
          { type: 'text', text: from_chain },
          { type: 'text', text: to_chain },
          { type: 'text', text: fee },
          { type: 'text', text: est_time }
        ]
      }
    ]
  };
}

/**
 * Template: bridge_quote_pending
 * Parameter Format: POSITIONAL
 * No parameters needed
 */
export function bridgeQuotePending() {
  return {
    name: 'bridge_quote_pending',
    language: 'en',
    components: [
      {
        type: 'BODY'
      }
    ]
  };
}

/**
 * Template: crypto_deposit_notification
 * Parameter Format: POSITIONAL
 * Parameters: amount, token, network, balance
 */
export function cryptoDepositNotification({ amount, token, network, balance }: { amount: string, token: string, network: string, balance: string }) {
  return {
    name: 'crypto_deposit_notification',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: amount },
          { type: 'text', text: token },
          { type: 'text', text: network },
          { type: 'text', text: balance }
        ]
      }
    ]
  };
}

/**
 * Template: swap_processing
 * Parameter Format: POSITIONAL
 * No parameters needed
 */
export function swapProcessing() {
  return {
    name: 'swap_processing',
    language: 'en',
    components: [
      {
        type: 'BODY'
      }
    ]
  };
}

/**
 * Template: swap_quote_confirm
 * Parameter Format: POSITIONAL
 * Parameters: from_amount, to_amount, chain, rate, network_fee, est_time
 */
export function swapQuoteConfirm({ 
  from_amount, 
  to_amount, 
  chain, 
  rate, 
  network_fee, 
  est_time 
}: { 
  from_amount: string, 
  to_amount: string, 
  chain: string, 
  rate: string, 
  network_fee: string, 
  est_time: string 
}) {
  return {
    name: 'swap_quote_confirm',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: from_amount },
          { type: 'text', text: to_amount },
          { type: 'text', text: chain },
          { type: 'text', text: rate },
          { type: 'text', text: network_fee },
          { type: 'text', text: est_time }
        ]
      }
    ]
  };
}

/**
 * Template: quote_pending
 * Parameter Format: POSITIONAL
 * No parameters needed
 */
export function quotePending() {
  return {
    name: 'quote_pending',
    language: 'en',
    components: [
      {
        type: 'BODY'
      }
    ]
  };
}

/**
 * Template: swap_prompt
 * Parameter Format: POSITIONAL
 * Parameters: amount, from_token, to_token, network
 */
export function swapPrompt({ 
  amount, 
  from_token, 
  to_token, 
  network 
}: { 
  amount: string, 
  from_token: string, 
  to_token: string, 
  network: string 
}) {
  return {
    name: 'swap_prompt',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: amount },
          { type: 'text', text: from_token },
          { type: 'text', text: to_token },
          { type: 'text', text: network }
        ]
      }
    ]
  };
}

/**
 * Template: send_token_prompt
 * Parameter Format: POSITIONAL
 * Parameters: amount, token, recipient, network
 * Has QUICK_REPLY buttons
 */
export function sendTokenPrompt({ 
  amount, 
  token, 
  recipient, 
  network 
}: { 
  amount: string, 
  token: string, 
  recipient: string, 
  network: string 
}) {
  return {
    name: 'send_token_prompt',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: amount },
          { type: 'text', text: token },
          { type: 'text', text: recipient },
          { type: 'text', text: network }
        ]
      }
    ]
  };
}

/**
 * Template: token_received
 * Parameter Format: NAMED
 * Parameters: amount, network, balance
 */
export function tokenReceived({ amount, network, balance }: { amount: string, network: string, balance: string }) {
  return {
    name: 'token_received',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: amount, name: 'amount' },
          { type: 'text', text: network, name: 'network' },
          { type: 'text', text: balance, name: 'balance' }
        ]
      }
    ]
  };
}

/**
 * Template: bridge_failed
 * Parameter Format: NAMED
 * Parameters: reason
 */
export function bridgeFailed({ reason }: { reason: string }) {
  return {
    name: 'bridge_failed',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: reason, name: 'reason' }
        ]
      }
    ]
  };
}

/**
 * Template: send_success
 * Parameter Format: NAMED
 * Parameters: amount, token, recipient, balance
 * Has URL button
 */
export function sendSuccess({ amount, token, recipient, balance, explorerUrl }: { amount: string, token: string, recipient: string, balance: string, explorerUrl: string }) {
  return {
    name: 'send_success',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: amount, name: 'amount' },
          { type: 'text', text: token, name: 'token' },
          { type: 'text', text: recipient, name: 'recipient' },
          { type: 'text', text: balance, name: 'balance' }
        ]
      }
    ]
  };
}

/**
 * Template: swap_success
 * Parameter Format: NAMED
 * Parameters: from_amount, to_amount, network, balance
 * Has URL button
 */
export function swapSuccess({ from_amount, to_amount, network, balance, explorerUrl }: { from_amount: string, to_amount: string, network: string, balance: string, explorerUrl: string }) {
  return {
    name: 'swap_success',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: from_amount, name: 'from_amount' },
          { type: 'text', text: to_amount, name: 'to_amount' },
          { type: 'text', text: network, name: 'network' },
          { type: 'text', text: balance, name: 'balance' }
        ]
      }
    ]
  };
}

/**
 * Template: bridge_success
 * Parameter Format: NAMED
 * Parameters: amount, from_network, to_network, balance
 */
export function bridgeSuccess({ amount, from_network, to_network, balance }: { amount: string, from_network: string, to_network: string, balance: string }) {
  return {
    name: 'bridge_success',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: amount, name: 'amount' },
          { type: 'text', text: from_network, name: 'from_network' },
          { type: 'text', text: to_network, name: 'to_network' },
          { type: 'text', text: balance, name: 'balance' }
        ]
      }
    ]
  };
}

/**
 * Template: send_failed
 * Parameter Format: NAMED
 * Parameters: reason
 */
export function sendFailed({ reason }: { reason: string }) {
  return {
    name: 'send_failed',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: reason || 'Unknown error', name: 'reason' }
        ]
      }
    ]
  };
}

/**
 * Template: wallet_balance
 * Parameter Format: POSITIONAL
 * Parameters: eth_balance, usdc_base_balance, sol_balance, usdc_solana_balance
 */
export function walletBalance({ 
  eth_balance, 
  usdc_base_balance, 
  sol_balance, 
  usdc_solana_balance 
}: { 
  eth_balance: string, 
  usdc_base_balance: string, 
  sol_balance: string, 
  usdc_solana_balance: string 
}) {
  return {
    name: 'wallet_balance',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: eth_balance },
          { type: 'text', text: usdc_base_balance },
          { type: 'text', text: sol_balance },
          { type: 'text', text: usdc_solana_balance }
        ]
      }
    ]
  };
}

/**
 * Template: wallet_created_multi
 * Parameter Format: NAMED
 * Parameters: evm_wallet, solana_wallet
 */
export function walletCreatedMulti({ evm_wallet, solana_wallet }: { evm_wallet: string, solana_wallet: string }) {
  return {
    name: 'wallet_created_multi',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: evm_wallet, name: 'evm_wallet' },
          { type: 'text', text: solana_wallet, name: 'solana_wallet' }
        ]
      }
    ]
  };
}

/**
 * Template: private_keys
 * Parameter Format: POSITIONAL
 * Parameters: privy_link
 */
export function privateKeys({ privy_link }: { privy_link: string }) {
  return {
    name: 'private_keys',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: privy_link }
        ]
      }
    ]
  };
}

/**
 * Template: no_wallet_yet
 * Parameter Format: POSITIONAL (no named parameters)
 * Has QUICK_REPLY button
 */
export function noWalletYet() {
  return {
    name: 'no_wallet_yet',
    language: 'en',
    components: [
      {
        type: 'BODY'
      }
    ]
  };
}

// For error messages, use send_failed template
export function errorTemplate(reason: string) {
  return sendFailed({ reason });
}

// Alias for swap_failed - using send_failed template since there's no dedicated swap_failed template
export function swapFailed() {
  return sendFailed({ reason: 'Swap failed' });
}

// Alias for swap_pending - using tx_pending template
export function swapPending() {
  return txPending();
}

// Alias for transaction_success - using send_success template
export function transactionSuccess({ amount, recipient_address, transaction_hash }: { amount: string, recipient_address: string, transaction_hash: string }) {
  return sendSuccess({
    amount,
    token: 'ETH',
    recipient: recipient_address,
    balance: '0 ETH', // This would need to be updated with actual balance
    explorerUrl: transaction_hash ? `https://basescan.org/tx/${transaction_hash}` : ''
  });
}

// Alias for confirm_transaction - using send_failed template as fallback
export function confirmTransaction({ amount, recipient_address, network_fee }: { amount: string, recipient_address: string, network_fee: string }) {
  return sendFailed({
    reason: `Confirm Transaction: ${amount} ETH to ${recipient_address}. Fee: ${network_fee} ETH`
  });
}

// Legacy wallet templates for backward compatibility
export const walletTemplates = {
  balance: (balance: string, currency: string = 'ETH') => ({
    type: 'buttons' as const,
    text: `💰 *Wallet Balance*\n\nYour current balance is *${balance} ${currency}*`,
    buttons: [
      { id: 'send', title: 'Send' },
      { id: 'receive', title: 'Receive' }
    ]
  }),
  address: (address: string) => ({
    type: 'text' as const,
    text: `📬 *Wallet Address*\n\n\`${address}\`\n\n_Use this address to receive funds_`
  }),
  walletAddress: (address: string): string =>
    `📬 *Wallet Address*\n\n\`${address}\`\n\n_Use this address to receive funds_`,
  createWallet: (phrase: string): string =>
    `🔑 *New Wallet Created*\n\nYour wallet has been created successfully!\n\n*Recovery Phrase:*\n\`${phrase}\`\n\n⚠️ *IMPORTANT*: Write down this recovery phrase and keep it safe. Anyone with this phrase can access your funds!`,
};

// Alias for swap_successful - using swap_success template
export function swapSuccessful({ success_message, wallet_balance, tx_hash }: { success_message: string, wallet_balance: string, tx_hash: string }) {
  // Parse from success_message
  const parts = success_message.split(' to ');
  const from_amount = parts[0].replace('Swapped ', '');
  const to_amount = parts[1] || '';
  
  return swapSuccess({
    from_amount,
    to_amount,
    network: 'Base',
    balance: wallet_balance,
    explorerUrl: tx_hash ? `https://basescan.org/tx/${tx_hash}` : ''
  });
}

// Simple wallet_created template (not in approved templates, using basic format)
export function walletCreated({ address }: { address: string }) {
  return {
    type: 'buttons',
    text: `✅ *Wallet Created*\n\nYour new wallet has been created!\n\n*Address:*\n\`${address}\`\n\nYou can now receive and send crypto.`,
    buttons: [
      { id: 'view_wallet', title: 'View Wallet' }
    ]
  };
}

/**
 * Template: users_wallet_addresses
 * Parameter Format: POSITIONAL
 * Parameters: evm_wallet, solana_wallet
 */
export function usersWalletAddresses({ evm_wallet, solana_wallet }: { evm_wallet: string, solana_wallet: string }) {
  return {
    name: 'users_wallet_addresses',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: evm_wallet },
          { type: 'text', text: solana_wallet }
        ]
      }
    ]
  };
}