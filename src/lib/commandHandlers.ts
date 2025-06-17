import { 
  walletTemplates,
  helpTemplates
} from './whatsappTemplates'; // tokenTemplates, nftTemplates, txTemplates not currently used
import { getOrCreateWallet, getCachedWalletCredentials } from './wallet'; // Used in wallet operations
import { 
  WhatsAppResponse, 
  TextResponse, 
  CommandContext,
  CommandMessage,
  ButtonsResponse
} from '@/types/whatsapp'; // ImageResponse and ListResponse not currently used

// Re-export for backward compatibility
export type { CommandContext, CommandMessage };

// Define response types for command handlers
type CommandResponse = Promise<WhatsAppResponse | string | null>;

// Use helpTemplates in a log statement
if (typeof helpTemplates === 'object') {
  // Log available help template keys (commented out to avoid console noise)
  // console.log('Available help templates:', Object.keys(helpTemplates));
}

const createTextResponse = (text: string): TextResponse => ({
  type: 'text',
  text
});

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
  
  // Extract command and arguments
  const parts = messageText.trim().toLowerCase().split(/\s+/);
  const command = parts[0] || '';
  const args = parts.slice(1);

  try {
    // Log the command execution with userId
    console.log(`Handling command: ${command} with args: [${args.join(', ')}] for user ${userId}`);
    
    // Handle different commands
    switch (command) {
      case '/balance':
        return await getWalletBalance(userId);
        
      case '/wallet':
        return await handleWalletCommand(userId, args);
      
      case '/help':
        return createTextResponse(getHelpMessage());
      
      default:
        return createTextResponse("I didn't understand that command. Type '/help' for a list of available commands.");
    }
  } catch (error) {
    console.error('Error in handleCommand:', error);
    return createTextResponse('Sorry, an error occurred while processing your request. Please try again later.');
  }
};

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
    `- /wallet address - Get your wallet address`;
}

// Implement the actual wallet operations
async function getWalletBalance(userId: string): Promise<WhatsAppResponse | string> {
  try {
    // Check if wallet exists first
    const existingWallet = getCachedWalletCredentials(userId);
    if (!existingWallet) {
      console.log(`No wallet found for user ${userId} when checking balance`);
      return walletTemplates.noWallet();
    }
    
    // Use existing wallet without creating a new one
    const { getOrCreateWallet } = await import('./wallet');
    const wallet = await getOrCreateWallet(userId, existingWallet.address, false);
    
    // Get balance directly without storing the address since it's not used
    const balance = await wallet.getBalance();
    
    // Convert BigInt to string for the template
    return walletTemplates.balance(balance.toString(), 'ETH');
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return walletTemplates.noWallet();
  }
}

async function createWallet(userId: string): Promise<ButtonsResponse> {
  try {
    console.log(`[WALLET CREATE] Explicit wallet creation requested for user ${userId}`);
    
    // Check if a wallet already exists
    const existingWallet = getCachedWalletCredentials(userId);
    if (existingWallet) {
      console.log(`[WALLET CREATE] User ${userId} already has a wallet with address ${existingWallet.address}`);
      return walletTemplates.walletExists(existingWallet.address) as ButtonsResponse;
    }

    // If no wallet exists, create a new one with forceNew=true to ensure a fresh wallet
    console.log(`[WALLET CREATE] Creating new wallet for user ${userId} with forceNew=true`);
    
    // Import dynamically to avoid circular dependencies
    const { getOrCreateWallet } = await import('./wallet');
    
    // IMPORTANT: Force create a new wallet with explicit forceNew=true
    console.log(`[WALLET CREATE] Calling getOrCreateWallet with userId=${userId}, address=undefined, forceNew=true`);
    const wallet = await getOrCreateWallet(userId, undefined, true);
    
    // Verify the wallet was created by getting its address
    console.log(`[WALLET CREATE] Getting address for newly created wallet for user ${userId}`);
    const address = await wallet.getAddress();
    console.log(`[WALLET CREATE] New wallet address for user ${userId}: ${address}`);
    
    // Register this wallet with AgentKit for persistence across requests
    console.log(`[WALLET CREATE] Registering wallet with AgentKit for user ${userId}`);
    const { registerUserWallet } = await import('./agentkit');
    await registerUserWallet(userId, wallet);
    console.log(`[WALLET CREATE] Registered wallet with AgentKit for user ${userId}`);
    
    // Double-check that the wallet is now registered
    try {
      const { getUserWalletProvider } = await import('./agentkit');
      console.log(`[WALLET CREATE] Verifying wallet registration for user ${userId}`);
      const registeredWallet = await getUserWalletProvider(userId);
      if (registeredWallet) {
        const registeredAddress = await registeredWallet.getAddress();
        if (registeredAddress === address) {
          console.log(`[WALLET CREATE] Successfully verified wallet registration for user ${userId}`);
        } else {
          console.warn(`[WALLET CREATE] Wallet address mismatch for user ${userId}: created=${address}, registered=${registeredAddress}`);
        }
      } else {
        console.warn(`[WALLET CREATE] Failed to verify wallet registration for user ${userId}`);
      }
    } catch (verifyError) {
      console.error(`[WALLET CREATE] Error verifying wallet registration:`, verifyError);
    }
    
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
      text: 'Failed to create wallet. Please try again later.',
      buttons: [{ id: 'try_again', title: 'Try Again' }]
    };
  }
}

async function getWalletAddress(userId: string): Promise<WhatsAppResponse | string> {
  try {
    // Check if wallet exists first
    const existingWallet = getCachedWalletCredentials(userId);
    if (!existingWallet) {
      console.log(`No wallet found for user ${userId} when checking address`);
      return walletTemplates.noWallet();
    }
    
    // Use the address directly from cache
    return walletTemplates.walletAddress(existingWallet.address);
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return walletTemplates.noWallet();
  }
}

// Help message
function getHelpMessage(): string {
  return `📋 *Available Commands*:\n\n` +
    `*Wallet Commands:*\n` +
    `- /wallet balance - Check your wallet balance\n` +
    `- /wallet create - Create a new wallet\n` +
    `- /wallet address - Get your wallet address\n\n` +
    `*Other Commands:*\n` +
    `- /help - Show this help message`;
}
// Utility function to send a WhatsApp message
// This function is kept for future implementation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function sendWhatsAppMessage(
  to: string, 
  message: string,
  previewUrl: boolean = false
): Promise<void> {
  try {
    // In a real implementation, you would use the WhatsApp API to send the message
    console.log(`Sending message to ${to}: ${message}${previewUrl ? ' (with preview)' : ''}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Message sent successfully');
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw new Error('Failed to send message');
  }
}

// ... (rest of the code remains the same)
