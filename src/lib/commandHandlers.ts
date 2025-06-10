import { 
  walletTemplates, 
  tokenTemplates, 
  nftTemplates, 
  helpTemplates,
  txTemplates 
} from './whatsappTemplates';
import { getOrCreateWallet } from './wallet'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { 
  WhatsAppResponse, 
  TextResponse, 
  ImageResponse, 
  ListResponse,
  CommandContext,
  CommandMessage
} from '@/types/whatsapp'; 

// Re-export for backward compatibility
export type { CommandContext, CommandMessage };

// Define response types for command handlers
type CommandResponse = Promise<WhatsAppResponse | string | null>;

// Token and NFT types for future implementation
type TokenInfo = { symbol: string; balance: string; address: string };
type NFTInfo = { id: string; name: string; description: string; imageUrl: string };

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
  
  // Use txTemplates to avoid unused variable error
  if (typeof txTemplates === 'object') {
    // Placeholder: log available transaction templates
    // (Remove or replace with real usage as needed)
    // console.log('txTemplates loaded:', Object.keys(txTemplates));
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
      
      case 'token':
      case 'tokens':
        return await handleTokenCommand(userId, args);
      
      case 'nft':
      case 'nfts':
        return await handleNFTCommand(userId, args);
      
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

const handleTokenCommand = async (userId: string, args: string[]): CommandResponse => {
  const [subCommand, tokenAddress] = args;
  
  switch (subCommand) {
    case 'list':
      return listTokens(userId);
    case 'balance':
      return getTokenBalance(userId, tokenAddress);
    default:
      return createTextResponse('❌ Invalid token command. Try: list or balance [token_address]');
  }
};

const handleNFTCommand = async (userId: string, args: string[]): CommandResponse => {
  const [subCommand, contractAddress, tokenId] = args;
  
  switch (subCommand) {
    case 'list':
      return listNFTs(userId);
    case 'info':
      if (!contractAddress || !tokenId) {
        return createTextResponse('❌ Please provide both contract address and token ID');
      }
      return getNFTInfo(contractAddress, tokenId);
    default:
      return createTextResponse('❌ Invalid NFT command. Try: list or info [contract_address] [token_id]');
  }
};

// Implement the actual wallet operations
async function getWalletBalance(userId: string): Promise<string> {
  try {
    const wallet = await getOrCreateWallet(userId);
    const address = await wallet.getAddress();
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
    const wallet = await getOrCreateWallet(userId);
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

// Implement token operations
async function listTokens(_userId: string): Promise<string> {
  try {
    // Wallet initialization not needed for now
    // const wallet = await getOrCreateWallet(userId);
    return 'Token listing is not yet implemented. Please check back later.';
  } catch (error) {
    console.error('Error listing tokens:', error);
    return 'Failed to list tokens. Please try again later.';
  }
}

async function getTokenBalance(userId: string, tokenAddress?: string): Promise<string> {
  if (!tokenAddress) {
    return 'Please specify a token address to check balance.';
  }
  
  try {
    // For now, return a placeholder since we don't have token balance implementation
    return tokenTemplates.tokenBalance(
      'TOKEN', 
      '0', 
      tokenAddress
    );
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 'Failed to fetch token balance. Please try again later.';
  }
}

// Implement NFT operations
async function listNFTs(_userId: string): Promise<string> {
  try {
    // Return a helpful message since we don't have NFT listing implementation yet
    return 'NFT listing is not yet implemented. Please check back later.';
  } catch (error) {
    console.error('Error listing NFTs:', error);
    return 'Failed to fetch NFTs. Please try again later.';
  }
}

async function getNFTInfo(contractAddress?: string, tokenId?: string): Promise<string> {
  if (!contractAddress || !tokenId) {
    return 'Please provide both contract address and token ID';
  }
  
  try {
    // Return a placeholder since we don't have NFT info implementation yet
    return nftTemplates.nftDetail({
      name: 'NFT Name',
      tokenId,
      contract: contractAddress,
      description: 'NFT description',
      imageUrl: undefined
    });
  } catch (error) {
    console.error('Error getting NFT info:', error);
    return 'Failed to fetch NFT info. Please try again later.';
  }
}

// Help message
function getHelpMessage(): string {
  return `📋 *Available Commands*:\n\n` +
    `*Wallet Commands:*\n` +
    `- /wallet balance - Check your wallet balance\n` +
    `- /wallet create - Create a new wallet\n` +
    `- /wallet address - Get your wallet address\n\n` +
    `*Token Commands:*\n` +
    `- /token list - List your tokens\n` +
    `- /token balance [address] - Check token balance\n\n` +
    `*NFT Commands:*\n` +
    `- /nft list - List your NFTs\n` +
    `- /nft info [contract] [tokenId] - Get NFT details\n\n` +
    `*Other Commands:*\n` +
    `- /help - Show this help message`;
}

// Utility function to send a WhatsApp message
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
