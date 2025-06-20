import { formatAddress } from './utils';

// Wallet Templates
export const walletTemplates = {
  // Basic wallet operations
  balance: (balance: string, currency: string = 'ETH'): string => 
    `💰 *Wallet Balance*\n\nYour current balance is *${balance} ${currency}*`,
    
  address: (address: string): string =>
    `📬 *Wallet Address*\n\n\`${address}\`\n\n_Use this address to receive funds_`,
    
  walletAddress: (address: string): string =>
    `📬 *Wallet Address*\n\n\`${address}\`\n\n_Use this address to receive funds_`,
    
  createWallet: (phrase: string): string =>
    `🔑 *New Wallet Created*\n\nYour wallet has been created successfully!\n\n*Recovery Phrase:*\n\`${phrase}\`\n\n⚠️ *IMPORTANT*: Write down this recovery phrase and keep it safe. Anyone with this phrase can access your funds!`,
    
  walletCreated: (address: string): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: `✅ *Wallet Created*\n\nYour new wallet has been created!\n\n*Address:*\n\`${address}\`\n\nYou can now receive and send crypto.`,
    buttons: [
      { id: 'view_wallet', title: 'View Wallet' }
    ]
  }),
    
  walletExists: (address: string): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: `ℹ️ *Wallet Exists*\n\nYou already have a wallet:\n\`${address}\`\n\nUse /wallet address to see it.`,
    buttons: [
      { id: 'view_wallet', title: 'View Wallet' }
    ]
  }),
    
  // First-time wallet creation prompt with action button
  noWallet: (): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: '❌ *No Wallet Found*\n\nYou don\'t have a wallet yet. Would you like to create a new wallet?',
    buttons: [
      { id: 'create_wallet', title: 'Create Wallet' }
    ]
  }),
    
  // Deposit template with instructions and QR code option
  deposit: (address: string): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: `💰 *Deposit Funds*\n\nTo deposit funds to your wallet, send cryptocurrency to this address:\n\n\`${address}\`\n\n*Steps:*\n1. Copy your wallet address above\n2. Open your preferred crypto wallet app\n3. Select "Send" or "Transfer"\n4. Paste your wallet address\n5. Enter the amount to send\n6. Confirm the transaction\n\n*Supported Networks:*\n• Base Sepolia (Testnet)`,
    buttons: [
      { id: 'copy_address', title: 'Copy Address' },
      { id: 'show_qr', title: 'Show QR Code' }
    ]
  }),
  
  // Withdrawal template with form to collect recipient address
  withdraw: (): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: `📤 *Withdraw Funds*\n\nTo withdraw funds from your wallet, you'll need to provide:\n\n1. Recipient address\n2. Amount to send\n3. Network/chain\n\nPlease click "Start Withdrawal" to begin the process.`,
    buttons: [
      { id: 'start_withdrawal', title: 'Start Withdrawal' }
    ]
  }),
  
  // Withdrawal address prompt
  withdrawAddress: (): string => 
    `📝 *Withdrawal - Step 1/3*\n\nPlease enter the recipient address where you want to send funds.\n\nFormat: 0x... (Ethereum-compatible address)`,
  
  // Withdrawal amount prompt
  withdrawAmount: (balance: string): string => 
    `📝 *Withdrawal - Step 2/3*\n\nYour current balance is *${balance} ETH*\n\nPlease enter the amount you wish to send (e.g., 0.01).`,
  
  // Withdrawal chain prompt
  withdrawChain: (): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: `📝 *Withdrawal - Step 3/3*\n\nPlease select the network for this transaction:`,
    buttons: [
      { id: 'chain_base_sepolia', title: 'Base Sepolia' },
      { id: 'chain_ethereum', title: 'Ethereum' }
    ]
  }),
  
  // Withdrawal confirmation
  withdrawConfirm: (amount: string, to: string, chain: string): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: `⚠️ *Confirm Withdrawal*\n\n*Amount:* ${amount} ETH\n*To:* ${to}\n*Network:* ${chain}\n\nPlease confirm this transaction.`,
    buttons: [
      { id: 'confirm_withdrawal', title: 'Confirm' },
      { id: 'cancel_withdrawal', title: 'Cancel' }
    ]
  }),
    
  sendConfirmation: (amount: string, to: string, fee: string): string =>
    `⚠️ *Confirm Transaction*\n\nSend *${amount} ETH* to:\n\`${to}\`\n\nNetwork fee: *${fee} ETH*\n\nReply *CONFIRM* to proceed or *CANCEL* to abort.`,
    
  sendSuccess: (txHash: string, amount: string, to: string): import('../types/whatsapp').ButtonsResponse => ({
    type: 'buttons',
    text: `✅ *Transaction Sent*\n\n*${amount} ETH* sent to:\n\`${to}\`\n\nView on Basescan: https://basescan.org/tx/${txHash}`,
    buttons: [
      { id: `view_basescan_${txHash}`, title: 'View on Basescan' }
    ]
  }),
    
  walletLocked: (): string =>
    `🔒 *Wallet Locked*\n\nYour wallet is currently locked. Use /unlock to access your wallet.`,
    
  invalidAddress: (): string =>
    `❌ *Invalid Address*\n\nThe address you provided is not a valid Ethereum address.`,
    
  insufficientFunds: (): string =>
    `❌ *Insufficient Funds*\n\nYou don't have enough ETH to complete this transaction.`,
};

// Token Templates
export const tokenTemplates = {
  // Token operations
  tokenBalance: (symbol: string, balance: string, address: string = ''): string =>
    `📊 *${symbol.toUpperCase()} Balance*\n\n*Balance:* ${balance} ${symbol.toUpperCase()}\n` +
    (address ? `*Contract:* \`${address}\`\n` : ''),
    
  tokenList: (tokens: Array<{symbol: string, balance: string, address: string}>): string =>
    `📊 *Your Tokens*\n\n` +
    tokens.map(t => `• *${t.symbol}*: ${t.balance} (\`${t.address}\`)`).join('\n') +
    '\n\nUse /token balance <address> to check a specific token',
    
  tokenTransfer: (amount: string, symbol: string, to: string): string =>
    `🔄 *Token Transfer*\n\n*${amount} ${symbol.toUpperCase()}* sent to:\n\`${to}\``,
    
  tokenApprove: (spender: string, symbol: string, amount: string = 'unlimited'): string =>
    `✅ *Approval Confirmed*\n\nApproved ${amount} ${symbol.toUpperCase()} for:\n\`${spender}\``,
    
  tokenInfo: (symbol: string, data: {
    name?: string;
    symbol?: string;
    decimals?: number | string;
    totalSupply?: string;
    address?: string;
  }): string =>
    `ℹ️ *${symbol.toUpperCase()} Info*\n\n` +
    `*Name:* ${data.name || 'N/A'}\n` +
    `*Symbol:* ${data.symbol || 'N/A'}\n` +
    `*Decimals:* ${data.decimals?.toString() || 'N/A'}\n` +
    `*Total Supply:* ${data.totalSupply || 'N/A'}\n` +
    `*Contract:* \`${data.address || 'N/A'}\``,
};

// NFT Templates
export const nftTemplates = {
  // NFT operations
  nftList: (nfts: Array<{
    name: string;
    contract: string;
    tokenId: string;
    imageUrl?: string;
  }>): string =>
    `🖼️ *Your NFTs*\n\n` +
    nfts.map(nft => `• *${nft.name}* (${nft.contract.slice(0, 6)}...${nft.contract.slice(-4)} #${nft.tokenId})`).join('\n') +
    '\n\nUse /nft info <contract> <tokenId> to view details',
    
  nftDetail: (nft: {
    name?: string;
    tokenId?: string;
    contract?: string;
    description?: string;
    imageUrl?: string;
  }): string =>
    `🖼️ *${nft.name || 'NFT'}*\n\n` +
    `*Token ID:* ${nft.tokenId || 'N/A'}\n` +
    `*Contract:* \`${nft.contract || 'N/A'}\`\n` +
    (nft.description ? `*Description:* ${nft.description}\n` : '') +
    (nft.imageUrl ? `\n[View Image](${nft.imageUrl})` : ''),
    
  nftDetails: (nft: {
    name?: string;
    description?: string;
    attributes?: Array<{
      trait_type: string;
      value: string | number;
    }>;
    imageUrl?: string;
  }): string =>
    `🖼️ *${nft.name || 'NFT Details'}*\n\n` +
    (nft.description ? `*Description:* ${nft.description}\n\n` : '') +
    (nft.attributes && nft.attributes.length > 0 
      ? `*Attributes:*\n` + nft.attributes.map(a => `• *${a.trait_type}:* ${a.value}`).join('\n') + '\n\n'
      : '') +
    (nft.imageUrl ? `[View Image](${nft.imageUrl})` : ''),
    
  nftTransfer: (tokenId: string, to: string): string =>
    `✅ *NFT Transferred*\n\nNFT #${tokenId} has been transferred to:\n\`${to}\``,
};

// Faucet Templates
export const faucetTemplates = {
  // Testnet faucet operations
  requestSubmitted: (address: string, amount: string = '0.05 ETH', estimatedTime: number = 5): string =>
    `🚰 *Faucet Request Submitted*\n\n` +
    `We've requested *${amount}* testnet funds for your wallet:\n\n` +
    `\`${address}\`\n\n` +
    `⏳ The funds should arrive in approximately *${estimatedTime} minutes*.\n\n` +
    `_Testnet funds are for testing only and have no real value._`,
    
  requestSuccess: (address: string, amount: string = '0.05 ETH'): string =>
    `✅ *Testnet Funds Received*\n\n` +
    `Your wallet has received *${amount}* testnet funds!\n\n` +
    `\`${address}\`\n\n` +
    `You can now use these funds to test transactions on the Base Sepolia testnet.`,
    
  requestFailed: (reason: string): string =>
    `❌ *Faucet Request Failed*\n\n` +
    `We couldn't request testnet funds for your wallet.\n\n` +
    `*Reason:* ${reason}\n\n` +
    `Please try again later or contact support if the issue persists.`,
    
  dailyLimitReached: (address: string): string =>
    `⚠️ *Daily Limit Reached*\n\n` +
    `You've reached the daily limit for testnet fund requests for address:\n\n` +
    `\`${address}\`\n\n` +
    `Please try again tomorrow.`
};

// Help & System Messages
export const helpTemplates = {
  mainMenu: (): string =>
    `🤖 *Welcome to Albus* 🤖\n\n` +
    `I'm your Web3 assistant. Here's what you can do:\n\n` +
    `*💰 Wallet*\n` +
    `/wallet balance - Check your wallet balance\n` +
    `/wallet address - Show your wallet address\n` +
    `/wallet create - Create a new wallet\n\n` +
    `*🪙 Tokens*\n` +
    `/token list - List your tokens\n` +
    `/token balance <address> - Check token balance\n\n` +
    `*🖼️ NFTs*\n` +
    `/nft list - List your NFTs\n` +
    `/nft info <contract> <tokenId> - View NFT details\n\n` +
    `*🚰 Testnet*\n` +
    `/faucet - Request testnet funds\n\n` +
    `*❓ Help*\n` +
    `/help - Show this help message`,
    
  walletHelp: (): string =>
    `💰 *Wallet Help*\n\n` +
    `*/wallet balance* - Check your wallet balance\n` +
    `*/wallet address* - Show your wallet address\n` +
    `*/wallet create* - Create a new wallet\n` +
    `*/send <amount> <to>* - Send ETH to an address\n` +
    `*/backup* - Show your recovery phrase\n` +
    `*/lock* - Lock your wallet\n` +
    `*/unlock <phrase>* - Unlock your wallet`,
    
  tokenHelp: (): string =>
    `🪙 *Token Help*\n\n` +
    `*/token list* - List your tokens\n` +
    `*/token balance <address>* - Check token balance\n` +
    `*/token send <amount> <symbol> <to>* - Send tokens\n` +
    `*/token approve <spender> <symbol> [amount]* - Approve token spending`,
    
  nftHelp: (): string =>
    `🖼️ *NFT Help*\n\n` +
    `*/nft list* - List your NFTs\n` +
    `*/nft info <contract> <tokenId>* - View NFT details\n` +
    `*/nft transfer <id> <to>* - Transfer an NFT`,
    
  faucetHelp: (): string =>
    `🚰 *Testnet Faucet Help*\n\n` +
    `*/faucet* - Request testnet funds for your wallet\n` +
    `*/faucet <address>* - Request testnet funds for a specific address\n\n` +
    `Faucet limits:\n` +
    `- One request per wallet address per day\n` +
    `- Testnet funds have no real value\n` +
    `- Only works on Base Sepolia testnet`,
    
  error: (message: string): string =>
    `❌ *Error*\n\n${message}`,
    
  invalidCommand: (): string =>
    `❌ *Invalid Command*\n\n` +
    `I didn't understand that command. Type /help to see available commands.`,
};

// Transaction Templates
export const txTemplates = {
  pending: (txHash: string): string =>
    `⏳ *Transaction Pending*\n\n` +
    `Your transaction is being processed.\n\n` +
    `View on Etherscan:\n` +
    `https://etherscan.io/tx/${txHash}`,
    
  success: (txHash: string, message: string = ''): string =>
    `✅ *Transaction Successful*\n\n` +
    `${message}\n\n` +
    `View on Etherscan:\n` +
    `https://etherscan.io/tx/${txHash}`,
    
  failed: (txHash: string, reason: string = ''): string =>
    `❌ *Transaction Failed*\n\n` +
    `${reason ? `${reason}\n\n` : ''}` +
    `View on Etherscan:\n` +
    `https://etherscan.io/tx/${txHash}`,
    
  confirmation: (confirmations: number, required: number, txHash: string): string =>
    `🔄 *Transaction Confirmed* (${confirmations}/${required})\n\n` +
    `Your transaction has ${confirmations} out of ${required} confirmations.\n\n` +
    `View on Etherscan:\n` +
    `https://etherscan.io/tx/${txHash}`,
};

/**
 * Creates a WhatsApp template for wallet details with Send/Receive buttons
 * @param address Wallet address
 * @param network Blockchain network (e.g., 'base', 'optimism')
 * @param nativeBalance Native token balance (ETH)
 * @param tokens Array of token balances
 * @returns WhatsApp template object for sending
 */
export function createWalletDetailsTemplate(
  address: string,
  network: string,
  nativeBalance: string,
  tokens: Array<{ symbol: string; name: string; formattedBalance: string }> = []
) {
  // Format the network name for display
  const networkDisplay = network.charAt(0).toUpperCase() + network.slice(1);
  
  // Format native balance (assuming ETH)
  const formattedNativeBalance = `${nativeBalance} ETH`;
  
  // Create token balance display
  const tokenBalances = tokens
    .filter(token => parseFloat(token.formattedBalance) > 0)
    .map(token => `• ${token.formattedBalance} ${token.symbol}`)
    .join('\n');
  
  // Create the message text
  let messageText = `*Wallet Details*\n\n`;
  messageText += `*Network:* ${networkDisplay}\n`;
  messageText += `*Address:* ${formatAddress(address)}\n\n`;
  messageText += `*Balances:*\n• ${formattedNativeBalance}`;
  
  if (tokenBalances) {
    messageText += `\n${tokenBalances}`;
  }
  
  // Create the template with enhanced buttons
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: messageText
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "send_crypto",
              title: "Send"
            }
          },
          {
            type: "reply",
            reply: {
              id: "receive_crypto",
              title: "Receive"
            }
          }
        ]
      }
    }
  };
}

/**
 * Creates a WhatsApp template for sending crypto
 * @param address User's wallet address
 * @returns WhatsApp template object for sending
 */
export function createSendCryptoTemplate(address: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "*Send Crypto*\n\nTo send crypto, please provide:\n\n1. Recipient address\n2. Amount\n3. Token (ETH, USDC, etc.)\n\nExample: `send 0.01 ETH to 0x123...`"
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "send_eth",
              title: "Send ETH"
            }
          },
          {
            type: "reply",
            reply: {
              id: "cancel_send",
              title: "Cancel"
            }
          }
        ]
      }
    }
  };
}

/**
 * Creates a WhatsApp template for receiving crypto
 * @param address User's wallet address
 * @returns WhatsApp template object for sending
 */
export function createReceiveCryptoTemplate(address: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `*Receive Crypto*\n\nYour wallet address:\n\`${address}\`\n\nShare this address with others to receive crypto.`
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "get_testnet_funds",
              title: "Get Testnet Funds"
            }
          }
        ]
      }
    }
  };
}

/**
 * Creates a WhatsApp template for transaction notifications (when receiving tokens)
 * @param amount Amount of tokens received
 * @param symbol Token symbol (e.g., 'ETH', 'USDC')
 * @param from Sender address
 * @param txHash Transaction hash
 * @param network Network name (e.g., 'base', 'optimism')
 * @returns WhatsApp template object for sending
 */
export function createTransactionNotificationTemplate(
  amount: string,
  symbol: string,
  from: string,
  txHash: string,
  network: string = 'base'
) {
  // Format the network name for display
  const networkDisplay = network.charAt(0).toUpperCase() + network.slice(1);
  
  // Create explorer URL based on network
  const explorerUrl = network === 'base' 
    ? `https://basescan.org/tx/${txHash}`
    : network === 'optimism'
      ? `https://optimistic.etherscan.io/tx/${txHash}`
      : `https://etherscan.io/tx/${txHash}`;
  
  // Create the message text
  const messageText = `💰 *Token Received*\n\n` +
    `You've received *${amount} ${symbol}*\n` +
    `From: ${formatAddress(from)}\n` +
    `Network: ${networkDisplay}\n\n` +
    `Click the button below to view transaction details.`;
  
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: messageText
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: `view_tx_${txHash}`,
              title: "View Transaction"
            }
          }
        ]
      }
    }
  };
}
