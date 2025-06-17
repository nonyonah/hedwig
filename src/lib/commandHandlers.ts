import { 
  walletTemplates,
  helpTemplates
} from './whatsappTemplates'; // tokenTemplates, nftTemplates, txTemplates not currently used
import { getOrCreateWallet, getCachedWalletCredentials } from './wallet'; // Used in wallet operations
import { 
  WhatsAppResponse, 
  TextResponse, 
  CommandContext,
  CommandMessage
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
  // Extract message text
  const messageText = context.message.text;
  
  // Log preview URL if it exists (commented out to avoid console noise)
  const previewUrl = context.message.preview_url;
  if (previewUrl) {
    // console.log(`Preview URL available: ${previewUrl}`);
  }
  
  const { userId } = context;
  const [command, ...args] = messageText.trim().toLowerCase().split(/\s+/);

  try {
    // Log the command execution with userId
    console.log(`Handling command: ${command} for user ${userId}`);
    
    // Handle different commands
    switch (command) {
      case 'balance':
      case 'wallet':
        return await handleWalletCommand(userId, args);
      
      case 'help':
        return getHelpMessage();
      
      default:
        return createTextResponse("I didn't understand that command. Type 'help' for a list of available commands.");
    }
  } catch (error) {
    console.error('Error in handleCommand:', error);
    return createTextResponse('Sorry, an error occurred while processing your request. Please try again later.');
  }
};

// Helper functions for different command types
const handleWalletCommand = async (_userId: string, args: string[]): CommandResponse => {
  const [subCommand] = args;
  
  switch (subCommand) {
    case 'balance':
      return getWalletBalance(_userId);
    case 'create':
      return createWallet(_userId);
    case 'address':
      return getWalletAddress(_userId);
    default:
      return getHelpMessage();
  }
};

// Implement the actual wallet operations
async function getWalletBalance(userId: string): Promise<string> {
  try {
    const wallet = await getOrCreateWallet(userId);
    // Get balance directly without storing the address since it's not used
    const balance = await wallet.getBalance();
    // Convert BigInt to string for the template
    return walletTemplates.balance(balance.toString(), 'ETH');
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return walletTemplates.noWallet();
  }
}

async function createWallet(userId: string): Promise<string> {
  try {
    // Check if a wallet already exists
    const existingWallet = getCachedWalletCredentials(userId);
    if (existingWallet) {
      return walletTemplates.walletExists(existingWallet.address);
    }

    // If no wallet exists, create a new one
    const wallet = await getOrCreateWallet(userId, undefined, true);
    const address = await wallet.getAddress();
    return walletTemplates.walletCreated(address);
  } catch (error) {
    console.error('Error creating wallet:', error);
    return 'Failed to create wallet. Please try again later.';
  }
}

async function getWalletAddress(userId: string): Promise<string> {
  try {
    const wallet = await getOrCreateWallet(userId);
    const address = await wallet.getAddress();
    return walletTemplates.walletAddress(address);
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
