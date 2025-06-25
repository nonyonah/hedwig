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
        type: 'BODY',
        text: "⏳ Transaction is pending confirmation...\n\nWe'll notify you when it's done."
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
        text: `🪙 You received ${amount} on ${network}!\n\n🔗 Your new balance is:  \n${balance}`
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
        text: `❌ Bridge failed: ${reason}.\n\nPlease try again later.`
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
        text: `✅ You sent ${amount} ${token} to:\n\n${recipient}\n\n🔗 Your new balance is:\n${balance}`
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
        text: `🔄 Swap complete!\n\nYou swapped ${from_amount}  \n→ ${to_amount} on ${network}.\n\n🔗 Your new balance is\n${balance}`
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
        text: `🌉 Bridge complete!\n\nYou sent ${amount}  \nfrom ${from_network} to ${to_network}.\n\n🔗 Your new balance is:  \n${balance}`
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
        text: `❌ Your send failed: ${reason}.\n\nTry again or contact support.`
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
        text: `💼 Balance on ${network}:\n\n${balances_list}\n\nThese are your funds!`
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
        text: `🪪 Your wallets have been created:\n\n🔹 EVM Wallet: *${evm_wallet}*  \n🔸 Solana Wallet: *${solana_wallet}*`
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
        text: `📬 *Wallet Address*\n\n\`${address}\`\n\n_Use this address to receive funds_`
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
        text: `💰 *Wallet Balance*\n\nYour current balance is *${balance_amount} ${currency}*`
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
        text: `🔐 Wallet export requested.\n\nAccess your keys securely using the link below:\n${privy_link}\n\nSupports:  \n🔹 EVM wallet  \n🔸 Solana wallet`
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
        type: 'BODY',
        text: "👋 Welcome!\n\nYou're almost ready to start.\n\nTap below to create your wallets:\n🔹 EVM (Base, Ethereum, etc.)\n🔸 Solana (fast + low fees)"
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