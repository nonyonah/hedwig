import { formatAddress } from './utils';

// Basic text template function
export function textTemplate(text: string) {
  return { text };
}

// WhatsApp template for tx_pending
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

// WhatsApp template for token_received
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

// WhatsApp template for bridge_failed
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

// WhatsApp template for send_success
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
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'View in Explorer',
            url: explorerUrl
          }
        ]
      }
    ]
  };
}

// WhatsApp template for swap_success
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
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'View in Explorer',
            url: explorerUrl
          }
        ]
      }
    ]
  };
}

// WhatsApp template for bridge_success
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

// WhatsApp template for send_failed
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

// WhatsApp template for wallet_balance
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

// WhatsApp template for wallet_created_multi
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

// WhatsApp template for wallet_address
export function walletAddress({ address }: { address: string }) {
  return {
    name: 'wallet_address',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: address }
        ]
      }
    ]
  };
}

// WhatsApp template for wallet_balance_update
export function walletBalanceUpdate({ balance_amount, currency }: { balance_amount: string, currency: string }) {
  return {
    name: 'wallet_balance_update',
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: balance_amount },
          { type: 'text', text: currency }
        ]
      }
    ]
  };
}

// WhatsApp template for private_keys
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

// WhatsApp template for no_wallet_yet
export function noWalletYet() {
  return {
    name: 'no_wallet_yet',
    language: 'en',
    components: [
      {
        type: 'BODY'
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'QUICK_REPLY',
            reply: {
              id: 'create_wallets',
              title: 'Create Wallets'
            }
          }
        ]
      }
    ]
  };
}

// Legacy templates to maintain compatibility
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

// WhatsApp template for swapSuccessful (alias for swapSuccess)
export function swapSuccessful({ success_message, wallet_balance, tx_hash }: { success_message: string, wallet_balance: string, tx_hash: string }) {
  return swapSuccess({
    from_amount: success_message.split(' to ')[0].replace('Swapped ', ''),
    to_amount: success_message.split(' to ')[1],
    network: 'Base',
    balance: wallet_balance,
    explorerUrl: tx_hash ? `https://basescan.org/tx/${tx_hash}` : ''
  });
}

// WhatsApp template for transactionSuccess
export function transactionSuccess({ amount, recipient_address, transaction_hash }: { amount: string, recipient_address: string, transaction_hash: string }) {
  return sendSuccess({
    amount,
    token: 'ETH',
    recipient: recipient_address,
    balance: '0 ETH', // This would need to be updated with actual balance
    explorerUrl: transaction_hash ? `https://basescan.org/tx/${transaction_hash}` : ''
  });
}

// WhatsApp template for confirmTransaction
export function confirmTransaction({ amount, recipient_address, network_fee }: { amount: string, recipient_address: string, network_fee: string }) {
  return {
    name: 'send_failed', // Using an approved template
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: `Confirm Transaction: ${amount} ETH to ${recipient_address}. Fee: ${network_fee} ETH` }
        ]
      }
    ]
  };
}

// WhatsApp template for swapFailed
export function swapFailed() {
  return {
    name: 'send_failed', // Using an approved template
    language: 'en',
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: 'Swap failed' }
        ]
      }
    ]
  };
}

// WhatsApp template for swapPending
export function swapPending() {
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

// Minimal fallback template for wallet_created
export function walletCreated({ address }: { address: string }) {
  return {
    type: 'buttons',
    text: `✅ *Wallet Created*\n\nYour new wallet has been created!\n\n*Address:*\n\`${address}\`\n\nYou can now receive and send crypto.`,
    buttons: [
      { id: 'view_wallet', title: 'View Wallet' }
    ]
  };
} 