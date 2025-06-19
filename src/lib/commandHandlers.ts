import { 
  walletTemplates,
  helpTemplates
} from './whatsappTemplates'; // tokenTemplates, nftTemplates, txTemplates not currently used
import { getOrCreateWallet } from './wallet'; // Import only getOrCreateWallet
import { 
  WhatsAppResponse, 
  TextResponse, 
  CommandContext,
  CommandMessage,
  ButtonsResponse,
  InteractiveTemplateResponse
} from '@/types/whatsapp'; // ImageResponse and ListResponse not currently used

// Re-export for backward compatibility
export type { CommandContext, CommandMessage };

// Define response types for command handlers
type CommandResponse = Promise<WhatsAppResponse | null>;

// Use helpTemplates in a log statement
if (typeof helpTemplates === 'object') {
  // Log available help template keys (commented out to avoid console noise)
  // console.log('Available help templates:', Object.keys(helpTemplates));
}

const createTextResponse = (text: string): TextResponse => ({
  type: 'text',
  text
});

// Store conversation context
const conversationContext = new Map<string, {
  lastCommand?: string;
  waitingFor?: string;
  data?: Record<string, any>;
  lastInteraction: number;
}>();

// Function to get or initialize conversation context
function getConversationContext(userId: string) {
  if (!conversationContext.has(userId)) {
    conversationContext.set(userId, {
      lastInteraction: Date.now()
    });
  }
  
  // Update the last interaction time
  const context = conversationContext.get(userId)!;
  context.lastInteraction = Date.now();
  
  return context;
}

// Function to update conversation context
function updateConversationContext(userId: string, updates: Partial<{
  lastCommand?: string;
  waitingFor?: string;
  data?: Record<string, any>;
}>) {
  const context = getConversationContext(userId);
  
  if (updates.lastCommand !== undefined) {
    context.lastCommand = updates.lastCommand;
  }
  
  if (updates.waitingFor !== undefined) {
    context.waitingFor = updates.waitingFor;
  }
  
  if (updates.data !== undefined) {
    context.data = { ...(context.data || {}), ...updates.data };
  }
}

// Function to clear conversation context
function clearConversationContext(userId: string) {
  if (conversationContext.has(userId)) {
    const lastInteraction = conversationContext.get(userId)!.lastInteraction;
    conversationContext.set(userId, { lastInteraction });
  }
}

// Clean up old conversation contexts periodically
const CONTEXT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, context] of conversationContext.entries()) {
    if (now - context.lastInteraction > CONTEXT_TIMEOUT_MS) {
      conversationContext.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

export const handleCommand = async (context: CommandContext): CommandResponse => {
  // Safely extract message text with a fallback
  const messageText = context.message?.text || '';
  
  if (!messageText) {
    console.error('Invalid message format: missing text property', context);
    return createTextResponse("I couldn't process your command due to a technical issue. Please try again.");
  }
  
  // Log the command for debugging
  console.log('Command message text:', messageText);
  
  // Log preview URL if it exists
  const previewUrl = context.message?.preview_url;
  if (previewUrl) {
    console.log(`Preview URL available: ${previewUrl}`);
  }
  
  // Get user ID with phone number as fallback
  const userId = context.userId || context.phoneNumber || 'unknown';
  
  // Get conversation context
  const conversationCtx = getConversationContext(userId);
  
  // Handle interactive responses (button clicks)
  if (context.messageType === 'interactive' && context.buttonPayload) {
    return await handleButtonResponse(userId, context.buttonPayload, conversationCtx);
  }
  
  // Extract command and arguments
  const parts = messageText.trim().toLowerCase().split(/\s+/);
  const command = parts[0] || '';
  const args = parts.slice(1);

  try {
    // Log the command execution with userId
    console.log(`Handling command: ${command} with args: [${args.join(', ')}] for user ${userId}`);
    
    // Check if we're waiting for a specific response in the conversation
    if (conversationCtx.waitingFor) {
      return await handleConversationResponse(userId, messageText, conversationCtx);
    }
    
    // Handle different commands
    switch (command) {
      case '/balance':
        updateConversationContext(userId, { lastCommand: '/balance' });
        return await getWalletBalance(userId);
        
      case '/wallet':
        updateConversationContext(userId, { lastCommand: '/wallet' });
        return await handleWalletCommand(userId, args);
      
      case '/help':
        clearConversationContext(userId);
        return createTextResponse(getHelpMessage());
      
      default:
        // If not a command, try to continue conversation based on context
        if (conversationCtx.lastCommand) {
          return await handleConversationContinuation(userId, messageText, conversationCtx);
        }
        
        clearConversationContext(userId);
        return createTextResponse("I didn't understand that command. Type '/help' for a list of available commands.");
    }
  } catch (error) {
    console.error('Error in handleCommand:', error);
    clearConversationContext(userId);
    return createTextResponse('Sorry, an error occurred while processing your request. Please try again later.');
  }
};

/**
 * Handle button responses from interactive messages
 */
async function handleButtonResponse(userId: string, buttonId: string, conversationCtx: any): CommandResponse {
  console.log(`Handling button response: ${buttonId} for user ${userId}`);
  
  // Handle different button actions
  switch (buttonId) {
    case 'create_wallet':
      updateConversationContext(userId, { lastCommand: '/wallet create' });
      return await createWallet(userId);
      
    case 'view_wallet':
      updateConversationContext(userId, { lastCommand: '/wallet balance' });
      return await getWalletBalance(userId);
      
    case 'send_crypto':
    case 'send_eth':
      updateConversationContext(userId, { 
        lastCommand: '/send', 
        waitingFor: 'recipient_address' 
      });
      return createTextResponse("Please enter the recipient address where you want to send funds.");
      
    case 'receive_crypto':
      updateConversationContext(userId, { lastCommand: '/receive' });
      // Import wallet functions
      const { userHasWalletInDb, getWalletBalances } = await import('./wallet');
      
      // Check if wallet exists
      const hasWallet = await userHasWalletInDb(userId);
      if (!hasWallet) {
        return walletTemplates.noWallet();
      }
      
      // Get wallet details including address
      const balances = await getWalletBalances(userId);
      if (!balances) {
        console.log(`Failed to get wallet details for user ${userId}`);
        return walletTemplates.noWallet();
      }
      
      // Import the template function
      const { createReceiveCryptoTemplate } = await import('./whatsappTemplates');
      
      // Return the receive template which shows the wallet address
      const template = createReceiveCryptoTemplate(balances.address);
      return {
        ...template,
        type: 'interactive_template'
      } as InteractiveTemplateResponse;
      
    default:
      // Check if it's a transaction view button
      if (buttonId.startsWith('view_tx_')) {
        const txHash = buttonId.replace('view_tx_', '');
        const { networkId } = await import('./serverEnv').then(m => m.getCdpEnvironment());
        const network = networkId === 'base-mainnet' ? 'base' : 
                      networkId === 'optimism-mainnet' ? 'optimism' : 'base';
        
        const explorerUrl = network === 'base' 
          ? `https://basescan.org/tx/${txHash}`
          : network === 'optimism'
            ? `https://optimistic.etherscan.io/tx/${txHash}`
            : `https://etherscan.io/tx/${txHash}`;
            
        return createTextResponse(`You can view your transaction here:\n${explorerUrl}`);
      }
      
      clearConversationContext(userId);
      return createTextResponse("I didn't understand that button action. Type '/help' for a list of available commands.");
  }
}

/**
 * Handle responses when waiting for specific information in a conversation
 */
async function handleConversationResponse(userId: string, messageText: string, conversationCtx: any): CommandResponse {
  console.log(`Handling conversation response for user ${userId}, waiting for: ${conversationCtx.waitingFor}`);
  
  switch (conversationCtx.waitingFor) {
    case 'recipient_address':
      // Validate the address
      const address = messageText.trim();
      const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
      
      if (!isValidAddress) {
        return createTextResponse("That doesn't look like a valid Ethereum address. Please enter a valid address starting with 0x followed by 40 hexadecimal characters.");
      }
      
      // Store the recipient address and ask for amount
      updateConversationContext(userId, { 
        waitingFor: 'send_amount',
        data: { recipientAddress: address }
      });
      
      return createTextResponse("Great! Now please enter the amount of ETH you want to send (e.g., 0.01)");
      
    case 'send_amount':
      // Validate the amount
      const amount = parseFloat(messageText.trim());
      
      if (isNaN(amount) || amount <= 0) {
        return createTextResponse("Please enter a valid positive number for the amount.");
      }
      
      // Store the amount and ask for confirmation
      const recipientAddress = conversationCtx.data?.recipientAddress;
      updateConversationContext(userId, { 
        waitingFor: 'send_confirmation',
        data: { sendAmount: amount }
      });
      
      return walletTemplates.withdrawConfirm(
        amount.toString(), 
        recipientAddress,
        'Base'
      );
      
    case 'send_confirmation':
      if (messageText.toLowerCase() === 'confirm' || messageText.toLowerCase() === 'yes') {
        // Process the transaction
        // This would need to be implemented with actual wallet transaction functionality
        clearConversationContext(userId);
        return createTextResponse("Transaction processing is not yet implemented in this demo.");
      } else {
        // Cancel the transaction
        clearConversationContext(userId);
        return createTextResponse("Transaction cancelled.");
      }
      
    default:
      clearConversationContext(userId);
      return createTextResponse("I'm not sure what you're trying to do. Type '/help' for a list of available commands.");
  }
}

/**
 * Handle continuation of conversation based on previous context
 */
async function handleConversationContinuation(userId: string, messageText: string, conversationCtx: any): CommandResponse {
  console.log(`Handling conversation continuation for user ${userId}, last command: ${conversationCtx.lastCommand}`);
  
  switch (conversationCtx.lastCommand) {
    case '/wallet':
    case '/wallet balance':
      return await getWalletBalance(userId);
      
    case '/wallet create':
      return await createWallet(userId);
      
    default:
      clearConversationContext(userId);
      return createTextResponse("I'm not sure what you're trying to do. Type '/help' for a list of available commands.");
  }
}

// Helper functions for different command types
const handleWalletCommand = async (userId: string, args: string[]): CommandResponse => {
  const subCommand = args[0] || '';
  console.log(`Handling wallet subcommand: '${subCommand}' for user ${userId}`);
  
  switch (subCommand) {
    case 'balance':
      return await getWalletBalance(userId);
      
    case 'create':
      console.log(`Executing wallet create command for user ${userId}`);
      return await createWallet(userId);
      
    case 'address':
      return await getWalletAddress(userId);
      
    case 'deposit':
      return await handleWalletDeposit(userId);
      
    case 'withdraw':
      return await handleWalletWithdraw(userId);
      
    case '':
      // No subcommand provided, show help
      console.log(`No subcommand provided for /wallet, showing help for user ${userId}`);
      return createTextResponse(getWalletHelp());
      
    default:
      console.log(`Unknown wallet subcommand: '${subCommand}' for user ${userId}`);
      return createTextResponse(getWalletHelp());
  }
};

// Wallet-specific help message
function getWalletHelp(): string {
  return `💰 *Wallet Commands*:\n\n` +
    `- /wallet create - Create a new wallet\n` +
    `- /wallet balance - Check your wallet balance\n` +
    `- /wallet address - Get your wallet address\n` +
    `- /wallet deposit - Show deposit instructions\n` +
    `- /wallet withdraw - Withdraw funds`;
}

// Implement the actual wallet operations
async function getWalletBalance(userId: string): Promise<WhatsAppResponse> {
  try {
    // Import required wallet functions
    const { userHasWalletInDb, getWalletBalances } = await import('./wallet');
    
    // Check if wallet exists first
    const hasWallet = await userHasWalletInDb(userId);
    if (!hasWallet) {
      console.log(`No wallet found for user ${userId} when checking balance`);
      return walletTemplates.noWallet();
    }
    
    // Get wallet balances including tokens
    const balances = await getWalletBalances(userId);
    if (!balances) {
      console.log(`Failed to get balances for user ${userId}`);
      return walletTemplates.noWallet();
    }
    
    // Import the template function
    const { createWalletDetailsTemplate } = await import('./whatsappTemplates');
    
    // Create the wallet details template with Send/Receive buttons
    const template = createWalletDetailsTemplate(
      balances.address,
      balances.network,
      balances.nativeBalance,
      balances.tokens
    );
    
    // Add the type property for our response type
    return {
      ...template,
      type: 'interactive_template'
    } as InteractiveTemplateResponse;
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return walletTemplates.noWallet();
  }
}

async function createWallet(userId: string): Promise<ButtonsResponse> {
  try {
    console.log(`[WALLET CREATE] Explicit wallet creation requested for user ${userId}`);
    
    // Import wallet functions
    const { userHasWalletInDb, getWalletFromDb } = await import('./wallet');
    
    // Check if a wallet already exists in the database
    const hasWalletInDb = await userHasWalletInDb(userId);
    
    if (hasWalletInDb) {
      console.log(`[WALLET CREATE] User ${userId} already has a wallet`);
      
      // Get wallet from the database
      const walletFromDb = await getWalletFromDb(userId);
      
      if (walletFromDb) {
        console.log(`[WALLET CREATE] Using wallet address from database: ${walletFromDb.address}`);
        return walletTemplates.walletExists(walletFromDb.address) as ButtonsResponse;
      }
      
      // This shouldn't happen, but just in case
      console.warn(`[WALLET CREATE] Wallet exists flag is true but no wallet found for user ${userId}`);
    }

    // If no wallet exists, create a new one
    console.log(`[WALLET CREATE] Creating new wallet for user ${userId}`);
    
    // Import the wallet creation function
    const { getOrCreateWallet } = await import('./wallet');
    
    // Create a new wallet
    const walletResult = await getOrCreateWallet(userId);
    
    // Verify the wallet was created by getting its address
    console.log(`[WALLET CREATE] Getting address for newly created wallet for user ${userId}`);
    const address = await walletResult.provider.getAddress();
    console.log(`[WALLET CREATE] New wallet address for user ${userId}: ${address}`);
    
    console.log(`[WALLET CREATE] New wallet created for user ${userId} with address ${address}`);
    
    // Return enhanced success message with the wallet address
    const successMessage = walletTemplates.walletCreated(address);
    console.log(`[WALLET CREATE] Returning wallet creation success message: ${successMessage.type || 'unknown'}`);
    return successMessage;
  } catch (error) {
    console.error('[WALLET CREATE] Error creating wallet:', error);
    // Return a text response for error case
    return {
      type: 'buttons',
      text: '❌ Wallet Creation Failed\n\nThere was an error creating your wallet. Please try again later.',
      buttons: [
        {
          id: 'retry_wallet_create',
          title: 'Try Again'
        }
      ]
    };
  }
}

async function getWalletAddress(userId: string): Promise<WhatsAppResponse> {
  try {
    // Import wallet functions
    const { userHasWalletInDb, getWalletBalances } = await import('./wallet');
    
    // Check if wallet exists
    const hasWallet = await userHasWalletInDb(userId);
    if (!hasWallet) {
      return walletTemplates.noWallet();
    }
    
    // Get wallet details including address
    const balances = await getWalletBalances(userId);
    if (!balances) {
      console.log(`Failed to get wallet details for user ${userId}`);
      return walletTemplates.noWallet();
    }
    
    // Import the template function
    const { createReceiveCryptoTemplate } = await import('./whatsappTemplates');
    
    // Return the receive template which shows the wallet address
    const template = createReceiveCryptoTemplate(balances.address);
    
    // Add the type property for our response type
    return {
      ...template,
      type: 'interactive_template'
    } as InteractiveTemplateResponse;
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return walletTemplates.noWallet();
  }
}

function getHelpMessage(): string {
  return `🤖 *Available Commands*:\n\n` +
    `- /wallet - Wallet management commands\n` +
    `- /help - Show this help message\n\n` +
    `Type '/wallet' for wallet-specific commands.`;
}

// Other functions remain unchanged
async function handleWalletDeposit(userId: string): Promise<WhatsAppResponse> {
  try {
    // Check if wallet exists first
    const { userHasWalletInDb, getWalletBalances } = await import('./wallet');
    
    const hasWallet = await userHasWalletInDb(userId);
    if (!hasWallet) {
      return walletTemplates.noWallet();
    }
    
    // Get wallet details including address
    const balances = await getWalletBalances(userId);
    if (!balances) {
      console.log(`Failed to get wallet details for user ${userId}`);
      return walletTemplates.noWallet();
    }
    
    // Import the template function
    const { createReceiveCryptoTemplate } = await import('./whatsappTemplates');
    
    // Return the receive template which shows the wallet address
    const template = createReceiveCryptoTemplate(balances.address);
    
    // Add the type property for our response type
    return {
      ...template,
      type: 'interactive_template'
    } as InteractiveTemplateResponse;
  } catch (error) {
    console.error('Error handling wallet deposit:', error);
    return createTextResponse('Could not process your deposit request. Please try again later.');
  }
}

async function handleWalletWithdraw(userId: string): Promise<WhatsAppResponse> {
  try {
    // Check if wallet exists
    const { userHasWalletInDb, getWalletBalances } = await import('./wallet');
    
    const hasWallet = await userHasWalletInDb(userId);
    if (!hasWallet) {
      return walletTemplates.noWallet();
    }
    
    // Get wallet details including address
    const balances = await getWalletBalances(userId);
    if (!balances) {
      console.log(`Failed to get wallet details for user ${userId}`);
      return walletTemplates.noWallet();
    }
    
    // Import the template function
    const { createSendCryptoTemplate } = await import('./whatsappTemplates');
    
    // Return the send template which provides instructions for sending crypto
    const template = createSendCryptoTemplate(balances.address);
    
    // Add the type property for our response type
    return {
      ...template,
      type: 'interactive_template'
    } as InteractiveTemplateResponse;
  } catch (error) {
    console.error('Error handling wallet withdrawal:', error);
    return createTextResponse('Could not process your withdrawal request. Please try again later.');
  }
}
