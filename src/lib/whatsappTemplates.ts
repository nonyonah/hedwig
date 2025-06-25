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
          { type: 'text', text: amount },
          { type: 'text', text: network },
          { type: 'text', text: balance }
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
          { type: 'text', text: reason }
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
          { type: 'text', text: amount },
          { type: 'text', text: token },
          { type: 'text', text: recipient },
          { type: 'text', text: balance }
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
          { type: 'text', text: from_amount },
          { type: 'text', text: to_amount },
          { type: 'text', text: network },
          { type: 'text', text: balance }
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
          { type: 'text', text: amount },
          { type: 'text', text: from_network },
          { type: 'text', text: to_network },
          { type: 'text', text: balance }
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
          { type: 'text', text: reason || 'Unknown error' }
        ]
      }
    ]
  };
}

/**
 * Template: wallet_balance
 * Parameter Format: NAMED
 * Parameters: network, balances_list
 */
export function walletBalance({ network, balances_list }: { network: string, balances_list: string }) {
  return {
    name: 'wallet_balance',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: network },
          { type: 'text', text: balances_list }
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
          { type: 'text', text: evm_wallet },
          { type: 'text', text: solana_wallet }
        ]
      }
    ]
  };
}

/**
 * Template: private_keys
 * Parameter Format: NAMED
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